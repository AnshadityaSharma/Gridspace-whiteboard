import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import {
    ArrowLeft, Edit, Eye, Check, X, Share2, Minus, Plus, Trash2, LogOut, Sun, Moon, Laptop,
    MousePointer, Square, Circle, Pipette, Type, Undo, Redo, SquareSlash, Terminal
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyBIrYTsM-yd_jwQ5d0tCNO1GF1Koztemdc",
  authDomain: "gridspace-whiteboard.firebaseapp.com",
  projectId: "gridspace-whiteboard",
  storageBucket: "gridspace-whiteboard.firebasestorage.app",
  messagingSenderId: "142967188261",
  appId: "1:142967188261:web:1ba1f02e649fd4c94f08cc"
};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-whiteboard-app';


// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Helper Functions & Constants ---
const generateShortCode = (length = 5) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

const FONT_SIZE = 24;
const LINE_HEIGHT = 1.2;

// --- Data & Drawing Logic ---
const getElementBounds = (element) => {
    if (!element) return null;
    const { type, x, y, path, width, height, x2, y2, radius } = element;
    const padding = (element.lineWidth || 0) / 2 + 5; // Padding for easier selection

    switch (type) {
        case 'path': {
            const xs = path.map(p => p.x);
            const ys = path.map(p => p.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);
            return {
                x: minX - padding,
                y: minY - padding,
                width: (maxX - minX) + padding * 2,
                height: (maxY - minY) + padding * 2
            };
        }
        case 'rectangle':
        case 'text': {
             const bounds = { x: Math.min(x, x + width), y: Math.min(y, y + height), width: Math.abs(width), height: Math.abs(height) };
             return {
                x: bounds.x - 5,
                y: bounds.y - 5,
                width: bounds.width + 10,
                height: bounds.height + 10
            };
        }
        case 'circle': {
            return {
                x: x - radius - padding,
                y: y - radius - padding,
                width: (radius + padding) * 2,
                height: (radius + padding) * 2
            };
        }
        case 'line': {
            const bounds = { x: Math.min(x, x2), y: Math.min(y, y2), width: Math.abs(x - x2), height: Math.abs(y - y2) };
            return {
                x: bounds.x - padding,
                y: bounds.y - padding,
                width: bounds.width + padding * 2,
                height: bounds.height + padding * 2
            };
        }
        default:
            return null;
    }
};

const isPointInsideBounds = (point, bounds) => {
    if (!bounds) return false;
    return point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
           point.y >= bounds.y && point.y <= bounds.y + bounds.height;
};

const doBoundsIntersect = (b1, b2) => {
    return !(b2.x > b1.x + b1.width || 
             b2.x + b2.width < b1.x || 
             b2.y > b1.y + b1.height ||
             b2.y + b2.height < b1.y);
};

// --- Main App Component ---
export default function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState(null);
    const [theme, setTheme] = useState('dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        const initAuth = async () => {
            try {
                // The environment may provide a custom token. This token is only valid
                // for the environment's own Firebase project. If you have provided your
                // own firebaseConfig, this token will be invalid, causing a mismatch.
                // The code handles this by falling back to anonymous sign-in.
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    // If no custom token is provided by the environment, sign in anonymously.
                    await signInAnonymously(auth);
                }
            } catch (error) {
                // This error is expected if you are running the code with your own
                // firebaseConfig in an environment that provides its own auth token.
                if (error.code === 'auth/custom-token-mismatch') {
                    console.log("Custom token mismatch detected. This is expected. Falling back to anonymous sign-in.");
                    try {
                        await signInAnonymously(auth);
                    } catch (fallbackError) {
                        console.error("Anonymous fallback sign-in also failed:", fallbackError);
                    }
                } else {
                    // For any other unexpected authentication errors, log them.
                    console.error("An unexpected authentication error occurred:", error);
                }
            }
        };

        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        
        initAuth();
        
        return () => unsubscribe();
    }, []);

    const handleSetSession = (sessionData) => setSession(sessionData);

    const handleLeaveSession = async () => {
        if (session && user) {
            const sessionRef = doc(db, `/artifacts/${appId}/public/data/sessions`, session.id);
            const sessionDoc = await getDoc(sessionRef);
            if (sessionDoc.exists()) {
                const sessionData = sessionDoc.data();
                const newParticipants = { ...sessionData.participants };
                delete newParticipants[user.uid];
                await updateDoc(sessionRef, { participants: newParticipants });
            }
        }
        setSession(null);
    };

    if (loading) return <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-[var(--font-sci-fi)]">Loading Systems...</div>;
    if (!user) return <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-[var(--font-sci-fi)]">Authenticating User...</div>;

    return (
        <div style={{ fontFamily: 'var(--font-sci-fi)' }} className="bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-screen transition-colors duration-500">
            <SciFiThemeStyles />
            {session ? (
                <WhiteboardScreen session={session} user={user} onLeave={handleLeaveSession} theme={theme} setTheme={setTheme} />
            ) : (
                <HomeScreen user={user} onJoinSession={handleSetSession} />
            )}
        </div>
    );
}


// --- Whiteboard Screen Component ---
function WhiteboardScreen({ session: initialSession, user, onLeave, theme, setTheme }) {
    const canvasRef = useRef(null);
    const textInputRef = useRef(null);

    const [sessionData, setSessionData] = useState(initialSession);
    const [elements, setElements] = useState([]);
    const [history, setHistory] = useState([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);
    
    const [action, setAction] = useState('none'); // none, drawing, moving, writing, panning, selecting
    const [tool, setTool] = useState('pen');
    const [shape, setShape] = useState('rectangle');
    const [color, setColor] = useState('#00aaff');
    const [lineWidth, setLineWidth] = useState(5);
    const [quickColors, setQuickColors] = useState(['#00aaff', '#ff64a2', '#64ffda', '#E6FF33']);
    
    const [selectedElements, setSelectedElements] = useState([]);
    const [startPoint, setStartPoint] = useState(null);
    const [textInput, setTextInput] = useState({ visible: false, x: 0, y: 0, width: 0, height: 0, value: '' });
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [viewTransform, setViewTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
    const [selectionRect, setSelectionRect] = useState(null);

    const userPermission = sessionData.participants[user.uid]?.permission || (sessionData.pendingRequests[user.uid] ? 'pending' : 'none');
    const isHost = sessionData.hostId === user.uid;

    const updateFirestoreWithHistory = (newHistory, newIndex) => {
        const sessionRef = doc(db, `/artifacts/${appId}/public/data/sessions`, initialSession.id);
        const dataToSave = {
            drawingData: JSON.stringify(newHistory[newIndex])
        };
        updateDoc(sessionRef, dataToSave);
    };

    const updateHistory = (newElements) => {
        const newHistory = [...history.slice(0, historyIndex + 1), newElements];
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        updateFirestoreWithHistory(newHistory, newHistory.length - 1);
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setElements(history[newIndex]);
            updateFirestoreWithHistory(history, newIndex);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setElements(history[newIndex]);
            updateFirestoreWithHistory(history, newIndex);
        }
    };

    const drawElement = useCallback((ctx, element) => {
        if (!element) return;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = element.color;
        ctx.lineWidth = element.lineWidth;
        ctx.shadowBlur = element.lineWidth / 3;
        ctx.shadowColor = element.color;
        ctx.fillStyle = element.color;

        switch (element.type) {
            case 'path':
                ctx.beginPath();
                ctx.moveTo(element.path[0].x, element.path[0].y);
                element.path.forEach(p => ctx.lineTo(p.x, p.y));
                ctx.stroke();
                break;
            case 'rectangle':
                ctx.strokeRect(element.x, element.y, element.width, element.height);
                break;
            case 'circle':
                ctx.beginPath();
                ctx.arc(element.x, element.y, element.radius, 0, 2 * Math.PI);
                ctx.stroke();
                break;
            case 'line':
                ctx.beginPath();
                ctx.moveTo(element.x, element.y);
                ctx.lineTo(element.x2, element.y2);
                ctx.stroke();
                break;
            case 'text':
                const fontName = getComputedStyle(document.documentElement).getPropertyValue('--font-sci-fi').trim() || 'sans-serif';
                ctx.font = `${FONT_SIZE}px "${fontName}"`;
                ctx.textBaseline = 'top';
                if (element.text) {
                    const words = element.text.split(' ');
                    let line = '';
                    let currentY = element.y;
                    for (let n = 0; n < words.length; n++) {
                        const testLine = line + words[n] + ' ';
                        const metrics = ctx.measureText(testLine);
                        const testWidth = metrics.width;
                        if (testWidth > Math.abs(element.width) && n > 0) {
                            ctx.fillText(line, element.x, currentY);
                            line = words[n] + ' ';
                            currentY += FONT_SIZE * LINE_HEIGHT;
                        } else {
                            line = testLine;
                        }
                    }
                    ctx.fillText(line, element.x, currentY);
                }
                break;
        }
        ctx.shadowBlur = 0;
    }, []);

    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        ctx.translate(viewTransform.offsetX, viewTransform.offsetY);
        ctx.scale(viewTransform.scale, viewTransform.scale);

        elements.forEach(element => drawElement(ctx, element));

        ctx.restore();

        // Draw selection boxes
        if (selectedElements.length > 0) {
            ctx.save();
            ctx.translate(viewTransform.offsetX, viewTransform.offsetY);
            ctx.scale(viewTransform.scale, viewTransform.scale);
            ctx.strokeStyle = 'var(--accent-primary)';
            ctx.lineWidth = 1 / viewTransform.scale;
            ctx.setLineDash([6 / viewTransform.scale, 4 / viewTransform.scale]);
            selectedElements.forEach(selectedId => {
                const element = elements.find(el => el.id === selectedId);
                const bounds = getElementBounds(element);
                if (bounds) {
                    ctx.strokeRect(bounds.x - 5, bounds.y - 5, bounds.width + 10, bounds.height + 10);
                }
            });
            ctx.restore();
        }
        
        // Draw selection rectangle
        if (selectionRect) {
            ctx.save();
            ctx.strokeStyle = 'var(--accent-primary)';
            ctx.fillStyle = 'rgba(0, 170, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
            ctx.fillRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
            ctx.restore();
        }

    }, [elements, drawElement, selectedElements, viewTransform, selectionRect]);

    useEffect(() => {
        const sessionRef = doc(db, `/artifacts/${appId}/public/data/sessions`, initialSession.id);
        const unsubscribe = onSnapshot(sessionRef, (doc) => {
            if (doc.exists()) {
                const data = { ...doc.data(), id: doc.id };
                setSessionData(data);
                const serverElements = JSON.parse(data.drawingData || '[]');
                if (JSON.stringify(serverElements) !== JSON.stringify(elements)) {
                    setElements(serverElements);
                    const newHistory = [serverElements, ...history.slice(1)];
                    setHistory(newHistory);
                    setHistoryIndex(0);
                }
            } else { onLeave(); }
        });
        return () => unsubscribe();
    }, [initialSession.id, onLeave]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const resize = () => {
            if (canvas) {
                canvas.width = canvas.offsetWidth;
                canvas.height = canvas.offsetHeight;
            }
            redrawCanvas();
        };
        window.addEventListener('resize', resize);
        resize();
        return () => window.removeEventListener('resize', resize);
    }, [redrawCanvas]);

    useEffect(redrawCanvas, [redrawCanvas]);
    
    useEffect(() => {
        if (textInput.visible && textInputRef.current) {
            textInputRef.current.focus();
        }
    }, [textInput.visible]);
    
    // Pan and Zoom listeners
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleKeyDown = (e) => {
            if (e.key === ' ') setIsSpacePressed(true);
        };
        const handleKeyUp = (e) => {
            if (e.key === ' ') setIsSpacePressed(false);
        };
        
        const handleWheel = (e) => {
            e.preventDefault();
            const { clientX, clientY, deltaY } = e;
            const rect = canvas.getBoundingClientRect();
            const mouseX = clientX - rect.left;
            const mouseY = clientY - rect.top;
            
            const zoomFactor = 1.1;
            const newScale = deltaY < 0 ? viewTransform.scale * zoomFactor : viewTransform.scale / zoomFactor;
            const scale = Math.min(Math.max(newScale, 0.1), 20);

            const worldX = (mouseX - viewTransform.offsetX) / viewTransform.scale;
            const worldY = (mouseY - viewTransform.offsetY) / viewTransform.scale;
            
            const newOffsetX = mouseX - worldX * scale;
            const newOffsetY = mouseY - worldY * scale;

            setViewTransform({ scale, offsetX: newOffsetX, offsetY: newOffsetY });
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        canvas.addEventListener('wheel', handleWheel);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            canvas.removeEventListener('wheel', handleWheel);
        };
    }, [viewTransform]);

    const getTransformedCoords = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { 
            x: (clientX - rect.left - viewTransform.offsetX) / viewTransform.scale,
            y: (clientY - rect.top - viewTransform.offsetY) / viewTransform.scale
        };
    };
    
    const createElement = (id, x, y, x2, y2) => {
        switch (tool) {
            case 'pen': return { id, type: 'path', path: [{ x, y }], color, lineWidth };
            case 'line': return { id, type: 'line', x, y, x2, y2, color, lineWidth };
            case 'shape':
                if (shape === 'rectangle') return { id, type: 'rectangle', x, y, width: x2 - x, height: y2 - y, color, lineWidth };
                if (shape === 'circle') return { id, type: 'circle', x, y, radius: Math.sqrt(Math.pow(x2 - x, 2) + Math.pow(y2 - y, 2)), color, lineWidth };
                break;
            case 'text':
                return { id, type: 'text', x, y, width: x2 - x, height: y2 - y, text: '', color, fontSize: FONT_SIZE };
        }
        return null;
    };
    
    const getElementAtPosition = (x, y, elements) => {
        for (let i = elements.length - 1; i >= 0; i--) {
            const element = elements[i];
            const bounds = getElementBounds(element);
            if (isPointInsideBounds({ x, y }, bounds)) {
                return element;
            }
        }
        return null;
    };

    const handleMouseDown = (e) => {
        if (userPermission !== 'draw' || textInput.visible) return;
        const { x, y } = getTransformedCoords(e);
        const screenCoords = {x: e.clientX, y: e.clientY};

        if (isSpacePressed) {
            setAction('panning');
            setStartPoint(screenCoords);
            return;
        }

        if (tool === 'select') {
            const element = getElementAtPosition(x, y, elements);
            if (element) {
                setSelectedElements([element.id]);
                setAction('moving');
                setStartPoint({ x, y, originalElements: elements.filter(el => el.id === element.id) });
            } else {
                setAction('selecting');
                setStartPoint({x, y});
                setSelectedElements([]);
            }
        } else if (tool === 'strokeEraser') {
            const elementToDelete = getElementAtPosition(x, y, elements);
            if (elementToDelete) {
                const updatedElements = elements.filter(el => el.id !== elementToDelete.id);
                setElements(updatedElements);
                updateHistory(updatedElements);
            }
        } else {
            setAction('drawing');
            const id = Date.now() + user.uid;
            const newElement = createElement(id, x, y, x, y);
            if (newElement) {
                const newElements = [...elements, newElement];
                setElements(newElements);
                setSelectedElements([newElement.id]);
            }
        }
    };

    const handleMouseMove = (e) => {
        if (userPermission !== 'draw' || action === 'none') return;
        const { x, y } = getTransformedCoords(e);
        const screenCoords = {x: e.clientX, y: e.clientY};

        if (action === 'panning') {
            const dx = screenCoords.x - startPoint.x;
            const dy = screenCoords.y - startPoint.y;
            setViewTransform(prev => ({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
            setStartPoint(screenCoords);
            return;
        }
        
        if (action === 'selecting') {
            const rect = {
                x: (Math.min(x, startPoint.x) * viewTransform.scale) + viewTransform.offsetX,
                y: (Math.min(y, startPoint.y) * viewTransform.scale) + viewTransform.offsetY,
                width: Math.abs(x - startPoint.x) * viewTransform.scale,
                height: Math.abs(y - startPoint.y) * viewTransform.scale
            };
            setSelectionRect(rect);
            return;
        }

        if (action === 'drawing' && selectedElements.length === 1) {
            const index = elements.findIndex(el => el.id === selectedElements[0]);
            if (index === -1) return;
            
            const updatedElements = [...elements];
            const currentElement = updatedElements[index];
            const { type } = currentElement;
            
            if (type === 'path') {
                currentElement.path.push({ x, y });
            } else if (type === 'line') {
                currentElement.x2 = x;
                currentElement.y2 = y;
            } else if (type === 'rectangle' || type === 'text') {
                currentElement.width = x - currentElement.x;
                currentElement.height = y - currentElement.y;
            } else if (type === 'circle') {
                currentElement.radius = Math.sqrt(Math.pow(x - currentElement.x, 2) + Math.pow(y - currentElement.y, 2));
            }
            setElements(updatedElements);
        } else if (action === 'moving' && selectedElements.length > 0 && startPoint) {
            const dx = x - startPoint.x;
            const dy = y - startPoint.y;
            
            const updatedElements = elements.map(el => {
                if (selectedElements.includes(el.id)) {
                    const originalElement = startPoint.originalElements.find(oel => oel.id === el.id);
                    const movedElement = { ...originalElement, id: el.id };
                    if (movedElement.type === 'path') {
                        movedElement.path = originalElement.path.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    } else if (movedElement.type === 'line') {
                        movedElement.x = originalElement.x + dx;
                        movedElement.y = originalElement.y + dy;
                        movedElement.x2 = originalElement.x2 + dx;
                        movedElement.y2 = originalElement.y2 + dy;
                    } else {
                        movedElement.x = originalElement.x + dx;
                        movedElement.y = originalElement.y + dy;
                    }
                    return movedElement;
                }
                return el;
            });
            setElements(updatedElements);
        }
    };

    const handleMouseUp = () => {
        if (action === 'selecting' && selectionRect) {
            const worldRect = {
                x: (selectionRect.x - viewTransform.offsetX) / viewTransform.scale,
                y: (selectionRect.y - viewTransform.offsetY) / viewTransform.scale,
                width: selectionRect.width / viewTransform.scale,
                height: selectionRect.height / viewTransform.scale,
            };
            const selectedIds = elements.filter(element => {
                const bounds = getElementBounds(element);
                return bounds && doBoundsIntersect(bounds, worldRect);
            }).map(el => el.id);
            setSelectedElements(selectedIds);
            setSelectionRect(null);
        } else if (action === 'drawing' && tool === 'text') {
            const textElement = elements.find(el => el.id === selectedElements[0]);
            if (!textElement) return;
            setAction('writing');
            const bounds = getElementBounds(textElement);
            setTextInput({
                visible: true,
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                value: ''
            });
        } else {
             if (action === 'drawing' || action === 'moving') {
                updateHistory(elements);
            }
        }
        setAction('none');
        setStartPoint(null);
    };

    const handleTextBlur = () => {
        if (selectedElements.length !== 1) return;
        const textElementId = selectedElements[0];

        const updatedElements = elements.map(el => {
            if (el.id === textElementId) {
                return { ...el, text: textInput.value };
            }
            return el;
        });

        if (!textInput.value.trim()) {
            const finalElements = updatedElements.filter(el => el.id !== textElementId);
            setElements(finalElements);
            updateHistory(finalElements);
        } else {
            setElements(updatedElements);
            updateHistory(updatedElements);
        }

        setTextInput({ visible: false, x: 0, y: 0, width: 0, height: 0, value: '' });
        setAction('none');
        setSelectedElements([]);
    };
    
    const handleClearCanvas = async () => {
        if (!isHost) return;
        setElements([]);
        updateHistory([]);
    };

    return (
        <div className={`flex flex-col h-screen w-screen bg-[var(--bg-primary)] transition-colors duration-500 overflow-hidden ${isSpacePressed || action === 'panning' ? 'cursor-grabbing' : ''}`}>
            <Header sessionData={sessionData} onLeave={onLeave} user={user} theme={theme} setTheme={setTheme} />
            <div className="flex flex-1 overflow-hidden">
                <div className="flex-1 flex flex-col p-4 relative">
                    <canvas ref={canvasRef}
                        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
                        className={`absolute top-4 left-4 w-[calc(100%-2rem)] h-[calc(100%-2rem)] bg-[var(--bg-secondary)] rounded-md border border-[var(--border-primary)] shadow-[0_0_20px_var(--accent-glow)] ${userPermission === 'draw' ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
                    />
                    {textInput.visible && (
                        <textarea
                            ref={textInputRef}
                            value={textInput.value}
                            onChange={(e) => setTextInput(prev => ({ ...prev, value: e.target.value }))}
                            onBlur={handleTextBlur}
                            style={{
                                position: 'absolute',
                                left: `${(textInput.x * viewTransform.scale) + viewTransform.offsetX + 16}px`,
                                top: `${(textInput.y * viewTransform.scale) + viewTransform.offsetY + 16}px`,
                                width: `${Math.abs(textInput.width) * viewTransform.scale}px`,
                                height: `${Math.abs(textInput.height) * viewTransform.scale}px`,
                                border: `1px solid var(--accent-primary)`,
                                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                                outline: 'none', zIndex: 20, fontSize: FONT_SIZE * viewTransform.scale, 
                                fontFamily: 'var(--font-sci-fi)',
                                resize: 'none', lineHeight: LINE_HEIGHT,
                                padding: `${4 * viewTransform.scale}px`
                            }}
                        />
                    )}
                    {userPermission === 'pending' && <PendingApprovalOverlay />}
                    {userPermission === 'watch' && <WatchOnlyOverlay />}
                    <div className="absolute bottom-5 right-5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs font-mono px-2 py-1 rounded-md z-20">
                        {Math.round(viewTransform.scale * 100)}%
                    </div>
                </div>
                <Sidebar sessionData={sessionData} user={user} />
            </div>
            {userPermission === 'draw' && <Toolbar tool={tool} setTool={setTool} shape={shape} setShape={setShape} color={color} setColor={setColor} lineWidth={lineWidth} setLineWidth={setLineWidth} onClear={handleClearCanvas} isHost={isHost} quickColors={quickColors} setQuickColors={setQuickColors} onUndo={handleUndo} onRedo={handleRedo} canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1} />}
        </div>
    );
}

// --- Components (Header, Sidebar, etc.) ---
function Toolbar({ tool, setTool, shape, setShape, color, setColor, lineWidth, setLineWidth, onClear, isHost, quickColors, setQuickColors, onUndo, onRedo, canUndo, canRedo }) {
    const colorPickerRef = useRef(null);
    const [editingColorIndex, setEditingColorIndex] = useState(null);

    const handleQuickColorChange = (e) => {
        const newColor = e.target.value;
        const newQuickColors = [...quickColors];
        newQuickColors[editingColorIndex] = newColor;
        setQuickColors(newQuickColors);
        setColor(newColor);
    };

    const tools = [
        { id: 'select', icon: MousePointer, label: 'Select & Move (Drag on canvas for multi-select)' },
        { id: 'pen', icon: Edit, label: 'Pen' },
        { id: 'line', icon: Minus, label: 'Line' },
        { id: 'shape', icon: Square, label: 'Shape' },
        { id: 'text', icon: Type, label: 'Text' },
        { id: 'strokeEraser', icon: SquareSlash, label: 'Eraser' }
    ];

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-[0_0_25px_var(--accent-glow)] rounded-lg p-2 flex items-center gap-2 z-30 transform transition-transform duration-300 ease-out">
            {/* History */}
            <div className="flex items-center bg-[var(--bg-primary)] p-1 rounded-md">
                <button onClick={onUndo} disabled={!canUndo} title="Undo" className="p-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-tertiary)] transition-colors"><Undo className="h-5 w-5" /></button>
                <button onClick={onRedo} disabled={!canRedo} title="Redo" className="p-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-tertiary)] transition-colors"><Redo className="h-5 w-5" /></button>
            </div>
            <div className="w-px h-8 bg-[var(--border-primary)]" />
            {/* Tools */}
            <div className="flex items-center bg-[var(--bg-primary)] p-1 rounded-md">
                {tools.map(t => <button key={t.id} onClick={() => setTool(t.id)} title={t.label} className={`p-2 rounded-md transition-all duration-200 ${tool === t.id ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)] scale-110' : 'hover:bg-[var(--bg-tertiary)]'}`}><t.icon className="h-5 w-5" /></button>)}
            </div>
            {tool === 'shape' && (
                <div className="flex items-center bg-[var(--bg-primary)] p-1 rounded-md">
                    <button onClick={() => setShape('rectangle')} className={`p-2 rounded-md transition-all duration-200 ${shape === 'rectangle' ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)] scale-110' : 'hover:bg-[var(--bg-tertiary)]'}`}><Square className="h-5 w-5" /></button>
                    <button onClick={() => setShape('circle')} className={`p-2 rounded-md transition-all duration-200 ${shape === 'circle' ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)] scale-110' : 'hover:bg-[var(--bg-tertiary)]'}`}><Circle className="h-5 w-5" /></button>
                </div>
            )}
            <div className="w-px h-8 bg-[var(--border-primary)]" />
            {/* Colors */}
            <div className="flex items-center gap-2">
                {quickColors.map((c, i) => (
                    <div key={i} className="relative group">
                        <button onClick={() => setColor(c)} className={`w-8 h-8 rounded-full transition-transform transform hover:scale-110 ${color === c ? 'ring-2 ring-offset-2 ring-offset-[var(--bg-secondary)] ring-[var(--accent-primary)]' : ''}`} style={{ backgroundColor: c }} />
                        <button onClick={() => { setEditingColorIndex(i); colorPickerRef.current.click(); }} className="absolute -top-1 -right-1 bg-[var(--bg-tertiary)] p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Pipette className="h-3 w-3" /></button>
                    </div>
                ))}
                <input type="color" ref={colorPickerRef} onChange={handleQuickColorChange} className="absolute w-0 h-0 opacity-0" />
            </div>
            <div className="w-px h-8 bg-[var(--border-primary)]" />
            {/* Line Width */}
            <div className="flex items-center gap-2">
                <button onClick={() => setLineWidth(Math.max(1, lineWidth - 2))} className="p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"><Minus className="h-5 w-5" /></button>
                <span className="font-mono w-6 text-center text-[var(--text-primary)]">{lineWidth}</span>
                <button onClick={() => setLineWidth(Math.min(50, lineWidth + 2))} className="p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"><Plus className="h-5 w-5" /></button>
            </div>
            {isHost && (<>
                <div className="w-px h-8 bg-[var(--border-primary)]" />
                <button onClick={onClear} className="flex items-center gap-2 bg-red-500/20 text-red-400 font-semibold py-2 px-3 rounded-lg hover:bg-red-500/40 transition-colors"><Trash2 className="h-5 w-5" /> Purge</button>
            </>)}
        </div>
    );
}

// --- Helper Components (Unchanged from previous version) ---
const SciFiThemeStyles = () => {
    useEffect(() => {
        const fontLink = document.createElement('link');
        fontLink.href = "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap";
        fontLink.rel = "stylesheet";
        document.head.appendChild(fontLink);
    }, []);
    return (
        <style>{`
            :root { --font-sci-fi: 'Orbitron', sans-serif; }
            [data-theme='light'] {
                --bg-primary: #eef2f9; --bg-secondary: #ffffff; --bg-tertiary: #f0f2f5; --bg-overlay: rgba(255,255,255,0.7);
                --text-primary: #1c1e21; --text-secondary: #606770;
                --border-primary: #dce1e6; --border-secondary: #ced0d4;
                --accent-primary: #1b74e4; --accent-secondary: #36a420; --accent-glow: rgba(27, 116, 228, 0.4);
            }
            [data-theme='dark'] {
                --bg-primary: #121212; --bg-secondary: #1e1e1e; --bg-tertiary: #2d2d2d; --bg-overlay: rgba(30,30,30,0.7);
                --text-primary: #e4e6eb; --text-secondary: #b0b3b8;
                --border-primary: #3a3b3c; --border-secondary: #4a4a4a;
                --accent-primary: #00aaff; --accent-secondary: #00ffaa; --accent-glow: rgba(0, 170, 255, 0.5);
            }
            [data-theme='blue'] {
                --bg-primary: #0a192f; --bg-secondary: #112240; --bg-tertiary: #0d2a52; --bg-overlay: rgba(17,34,64,0.7);
                --text-primary: #ccd6f6; --text-secondary: #8892b0;
                --border-primary: #233554; --border-secondary: #173a6e;
                --accent-primary: #64ffda; --accent-secondary: #ff64a2; --accent-glow: rgba(100, 255, 218, 0.4);
            }
            [data-theme='cyberpunk'] {
                --bg-primary: #0d0221; --bg-secondary: #261447; --bg-tertiary: #0d0221; --bg-overlay: rgba(13,2,33,0.7);
                --text-primary: #f0f2f5; --text-secondary: #a89ed0;
                --border-primary: #3a2d5c; --border-secondary: #5e478c;
                --accent-primary: #f43f5e; --accent-secondary: #00f6ff; --accent-glow: rgba(244, 63, 94, 0.5);
            }
        `}</style>
    );
};
function HomeScreen({ user, onJoinSession }) {
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => setIsMounted(true), []);

    const [joinCode, setJoinCode] = useState('');
    const [error, setError] = useState('');
    const [userName, setUserName] = useState('');
    const handleCreateSession = async () => {
        if (!userName.trim()) { setError('Please enter your call-sign.'); return; }
        setError('');
        const shortCode = generateShortCode();
        const sessionRef = doc(db, `/artifacts/${appId}/public/data/sessions`, shortCode);
        const newSession = {
            hostId: user.uid, shortCode, createdAt: serverTimestamp(),
            participants: { [user.uid]: { name: userName, permission: 'draw' } },
            pendingRequests: {}, drawingData: JSON.stringify([])
        };
        await setDoc(sessionRef, newSession);
        onJoinSession({ ...newSession, id: shortCode });
    };
    const handleJoinSession = async () => {
        if (!userName.trim()) { setError('Please enter your call-sign.'); return; }
        if (!joinCode.trim()) { setError('Please enter a session code.'); return; }
        setError('');
        const q = query(collection(db, `/artifacts/${appId}/public/data/sessions`), where("shortCode", "==", joinCode.toLowerCase()));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            setError('Session not found. Invalid coordinates.');
        } else {
            const sessionDoc = querySnapshot.docs[0];
            await updateDoc(sessionDoc.ref, { [`pendingRequests.${user.uid}`]: { name: userName } });
            onJoinSession({ ...sessionDoc.data(), id: sessionDoc.id });
        }
    };
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <div className={`w-full max-w-md mx-auto bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] shadow-[0_0_20px_var(--accent-glow)] p-8 transition-all duration-700 ease-out ${isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
                <h1 className="text-4xl font-bold text-center text-[var(--accent-primary)] mb-2 tracking-wider">GRIDSPACE WHITEBOARD</h1>
                <p className="text-center text-[var(--text-secondary)] mb-8">Real-time Visual Collaboration. Your UID: <span className="font-mono bg-[var(--bg-tertiary)] p-1 rounded text-[var(--accent-secondary)]">{user.uid}</span></p>
                <div className="mb-6">
                    <label htmlFor="name" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Call-Sign</label>
                    <input id="name" type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Enter your name"
                        className="w-full px-4 py-3 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-md focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] transition" />
                </div>
                <div className="space-y-6">
                    <div className="p-6 border border-[var(--border-primary)] rounded-md">
                        <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-4">Initiate New Session</h2>
                        <button onClick={handleCreateSession} disabled={!userName.trim()} className="w-full bg-[var(--accent-primary)] text-[var(--bg-primary)] font-bold py-3 px-4 rounded-md hover:shadow-[0_0_20px_var(--accent-glow)] transition-all duration-300 disabled:opacity-50 flex items-center justify-center">
                            <Edit className="mr-2 h-5 w-5" /> Create & Engage
                        </button>
                    </div>
                    <div className="p-6 border border-[var(--border-primary)] rounded-md">
                        <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-4">Join Existing Session</h2>
                        <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Enter session coordinates"
                            className="w-full px-4 py-3 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-md mb-4 focus:ring-2 focus:ring-[var(--accent-secondary)] focus:border-[var(--accent-secondary)] transition" />
                        <button onClick={handleJoinSession} disabled={!userName.trim() || !joinCode.trim()} className="w-full bg-[var(--accent-secondary)] text-[var(--bg-primary)] font-bold py-3 px-4 rounded-md hover:shadow-[0_0_20px_var(--accent-glow)] transition-all duration-300 disabled:opacity-50 flex items-center justify-center">
                            <ArrowLeft className="mr-2 h-5 w-5" /> Request Sync
                        </button>
                    </div>
                </div>
                {error && <p className="text-red-400 text-center mt-6">{error}</p>}
            </div>
        </div>
    );
}
function Header({ sessionData, onLeave, user, theme, setTheme }) {
    return (
        <header className="bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] shadow-md p-3 flex items-center justify-between z-20 transition-colors duration-500">
            <div className="flex items-center">
                <h1 className="text-2xl font-bold text-[var(--accent-primary)] tracking-wider">GRIDSPACE</h1>
                <div className="ml-6 flex items-center gap-2">
                    <span className="font-semibold text-[var(--text-secondary)]">Coords:</span>
                    <span className="font-mono bg-[var(--bg-tertiary)] text-[var(--accent-primary)] px-3 py-1 rounded-md">{sessionData.shortCode}</span>
                    <button onClick={() => navigator.clipboard.writeText(sessionData.shortCode)} className="p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"><Share2 className="h-5 w-5 text-[var(--text-secondary)]" /></button>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <ThemeSwitcher theme={theme} setTheme={setTheme} />
                <span className="text-sm text-[var(--text-secondary)]">User: {sessionData.participants[user.uid]?.name || 'Guest'}</span>
                <button onClick={onLeave} className="bg-red-500/80 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-500 transition-colors flex items-center gap-2"><LogOut className="h-5 w-5" /> Disconnect</button>
            </div>
        </header>
    );
}
function ThemeSwitcher({ theme, setTheme }) {
    const themes = [{ name: 'light', icon: Sun }, { name: 'dark', icon: Moon }, { name: 'blue', icon: Laptop }, { name: 'cyberpunk', icon: Terminal }];
    return (
        <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-full p-1 flex items-center gap-1">
            {themes.map(t => (<button key={t.name} onClick={() => setTheme(t.name)} className={`p-2 rounded-full transition-colors duration-300 ${theme === t.name ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}><t.icon className="h-5 w-5" /></button>))}
        </div>
    );
}
function Sidebar({ sessionData, user }) {
    const isHost = sessionData.hostId === user.uid;
    const sessionRef = doc(db, `/artifacts/${appId}/public/data/sessions`, sessionData.id);
    const handlePermissionChange = async (targetUserId, permission) => {
        if (!isHost) return;
        await updateDoc(sessionRef, { [`participants.${targetUserId}.permission`]: permission });
    };
    const handleRequest = async (requestingUserId, approve) => {
        if (!isHost) return;
        const requestorData = sessionData.pendingRequests[requestingUserId];
        const currentRequests = { ...sessionData.pendingRequests };
        delete currentRequests[requestingUserId];
        const updates = { pendingRequests: currentRequests };
        if (approve) {
            updates[`participants.${requestingUserId}`] = { name: requestorData.name, permission: 'watch' };
        }
        await updateDoc(sessionRef, updates);
    };
    return (
        <aside className="w-80 bg-[var(--bg-secondary)] border-l border-[var(--border-primary)] p-4 overflow-y-auto flex flex-col transition-transform duration-500 ease-out z-20 transform">
            {isHost && Object.keys(sessionData.pendingRequests || {}).length > 0 && (
                <div className="mb-6">
                    <h3 className="font-bold text-lg mb-2 text-[var(--accent-primary)]">Incoming Syncs</h3>
                    <div className="space-y-2">
                        {Object.entries(sessionData.pendingRequests).map(([uid, data]) => (
                            <div key={uid} className="bg-[var(--bg-tertiary)] p-3 rounded-md flex items-center justify-between">
                                <span className="font-medium text-[var(--text-primary)]">{data.name}</span>
                                <div className="flex gap-2">
                                    <button onClick={() => handleRequest(uid, true)} className="p-2 rounded-full bg-green-500/20 text-green-400 hover:bg-green-500/40 transition-colors"><Check className="h-5 w-5" /></button>
                                    <button onClick={() => handleRequest(uid, false)} className="p-2 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"><X className="h-5 w-5" /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div>
                <h3 className="font-bold text-lg mb-2 text-[var(--accent-primary)]">Connected Users</h3>
                 <p className="text-xs text-[var(--text-secondary)] mb-3 italic">Share the Coords with your friends to have them join the board!</p>
                <div className="space-y-3">
                    {Object.entries(sessionData.participants).map(([uid, data]) => (
                        <div key={uid} className="bg-[var(--bg-primary)] border border-[var(--border-primary)] p-3 rounded-md">
                            <div className="flex items-center justify-between">
                                <span className={`font-semibold ${uid === user.uid ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'}`}>{data.name} {uid === sessionData.hostId && '(Host)'} {uid === user.uid && '(You)'}</span>
                                {data.permission === 'draw' ? <Edit className="h-5 w-5 text-green-400" /> : <Eye className="h-5 w-5 text-yellow-400" />}
                            </div>
                            {isHost && uid !== user.uid && (
                                <div className="mt-3 flex gap-2">
                                    <button onClick={() => handlePermissionChange(uid, 'draw')} disabled={data.permission === 'draw'} className="text-xs font-semibold py-1 px-3 rounded-full bg-green-500/20 text-green-300 disabled:opacity-50 hover:bg-green-500/40 transition-colors">Allow Draw</button>
                                    <button onClick={() => handlePermissionChange(uid, 'watch')} disabled={data.permission === 'watch'} className="text-xs font-semibold py-1 px-3 rounded-full bg-yellow-500/20 text-yellow-300 disabled:opacity-50 hover:bg-yellow-500/40 transition-colors">Watch Only</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}
function PendingApprovalOverlay() {
    return (
        <div className="absolute inset-0 bg-[var(--bg-overlay)] flex flex-col items-center justify-center rounded-md text-white backdrop-blur-sm z-20 transition-all duration-300 animate-fade-in">
            <h2 className="text-3xl font-bold text-[var(--accent-primary)] tracking-wider">Awaiting Sync Approval</h2>
            <p className="mt-2 text-lg text-[var(--text-secondary)]">Host has been notified of your connection request.</p>
        </div>
    );
}
function WatchOnlyOverlay() {
    return (
        <div className="absolute top-4 right-4 bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 font-bold py-2 px-4 rounded-lg shadow-lg flex items-center gap-2 backdrop-blur-sm z-20 transition-all duration-300 animate-fade-in">
            <Eye className="h-5 w-5" /> Observation Mode
        </div>
    );
}
