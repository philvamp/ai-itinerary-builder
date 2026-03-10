import React, { useState, useEffect, useRef, useCallback } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Send, MicOff, Star, ChevronRight, Check, Coffee, Plane, Train, Car, Bed, Sparkles } from 'lucide-react';
import './index.css';

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';

const GREETINGS = [
  "Hello. I'm Sarah, your exclusive travel concierge. Before we begin planning your itinerary, who do I have the pleasure of speaking with, and where are you hoping to go?",
  "A very warm welcome. I'm Sarah. I would be delighted to plan the perfect escape for you. But first, what is your name, and where shall we be arranging your travel to?",
  "Good evening. I'm Sarah. I am here to design an utterly flawless trip just for you. Please tell me, who am I speaking with, and where are we heading?"
];

const App = () => {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [initialGreeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  const [messages, setMessages] = useState([
    { id: 1, sender: 'sarah', text: initialGreeting }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micStatus, setMicStatus] = useState('');
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const recognitionRef = useRef(null);
  // Ref tracks whether we INTEND to keep listening — checked synchronously in onend
  const shouldListenRef = useRef(false);

  // Speak the greeting once the user starts the session
  useEffect(() => {
    if (sessionStarted) {
      speakText(initialGreeting);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStarted, initialGreeting]);

  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicStatus('⚠️ Speech recognition not supported. Use Chrome or Edge.');
      return null;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';

    recognition.onstart = () => {
      setIsListening(true);
      setMicStatus('🎙️ Listening...');
    };

    recognition.onresult = (event) => {
      // Accumulate ALL results from 0 (not just the latest chunk)
      // This builds the full growing transcript correctly
      let fullTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
      }
      setInputText(fullTranscript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setMicStatus('❌ Microphone permission denied. Please allow access in your browser.');
        setIsListening(false);
      } else if (event.error === 'no-speech') {
        // Chrome fires this but often keeps going — don't stop listening
        console.log('No speech detected, continuing to listen...');
      } else {
        setMicStatus(`❌ Error: ${event.error}`);
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Only auto-restart if we still intend to listen (use ref for synchronous check)
      if (shouldListenRef.current) {
        try { recognition.start(); } catch { /* ignore if already starting */ }
      } else {
        setIsListening(false);
        setMicStatus('');
      }
    };

    return recognition;
  }, []);

  // Intelligently auto-scroll based on message type
  const scrollToNewMessage = () => {
    if (messages.length > 0 && !isTyping) {
      const lastMsg = messages[messages.length - 1];
      setTimeout(() => {
        const el = document.getElementById(`msg-${lastMsg.id}`);
        if (el) {
          if (lastMsg.showItinerary) {
            // For large itinerary rendering, align the top of Sarah's message to the top of the view
            // so her dialogue text isn't pushed out of frame above the cards
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            // For normal dialogue, just scroll it into view naturally at the bottom
            el.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }
      }, 100);
    }
  };

  useEffect(() => {
    scrollToNewMessage();
  }, [messages, isTyping]);

  const speakText = async (text) => {
    try {
      setIsSynthesizing(true);
      const response = await fetch(`${API_BASE_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
         console.warn("TTS API likely missing key, falling back to browser speech.", await response.text());
         throw new Error("TTS failed");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.playbackRate = 1.15;
        audioRef.current.play();
      }
    } catch {
       console.log('Using browser fallback voice.');
       const utterance = new SpeechSynthesisUtterance(text);
       // Try to find a British English female voice
       const voices = window.speechSynthesis.getVoices();
       const britishVoice = voices.find(v => v.lang === 'en-GB' && v.name.toLowerCase().includes('female'))
         || voices.find(v => v.lang === 'en-GB')
         || voices.find(v => v.lang.startsWith('en'));
       if (britishVoice) utterance.voice = britishVoice;
       utterance.lang = 'en-GB';
       utterance.rate = 1.05;
       utterance.pitch = 1.1;
       speechSynthesis.speak(utterance);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleSend = async (textOverride) => {
    const finalInputText = (textOverride || inputText).trim();
    if (!finalInputText) return;

    // Stop recognition if active
    if (recognitionRef.current && isListening) {
      shouldListenRef.current = false; // Tell onend NOT to restart
      recognitionRef.current.stop();
    }

    const newUserMsg = { id: Date.now(), sender: 'user', text: finalInputText };
    setMessages(prev => [...prev, newUserMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const apiMessages = [...messages, newUserMsg].map(msg => ({
        role: msg.sender === 'sarah' ? 'assistant' : 'user',
        content: msg.text
      }));

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages })
      });

      const data = await response.json();
      let replyText = data.reply || "I apologize, but I seem to be having difficulty connecting to my network. Please try again.";
      const hotel = data.hotel || null;
      const restaurant = data.restaurant || null;
      const booking = data.booking || null;
      const transport = data.transport || null;
      const transfer = data.transfer || null;
      const itinerary_days = data.itinerary_days || null;
      const showItinerary = !!(hotel || restaurant || transport || transfer);

      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        sender: 'sarah', 
        text: replyText, 
        showItinerary, 
        hotel, 
        restaurant,
        transport,
        transfer,
        booking,
        itinerary_days
      }]);
      await speakText(replyText);

    } catch (err) {
      console.error('Chat API Error', err);
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'sarah', text: 'I apologize, but my server appears to be temporarily down.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleMic = async () => {
    if (isListening) {
      // Deliberately stop — set ref first so onend doesn't restart
      shouldListenRef.current = false;
      if (recognitionRef.current) recognitionRef.current.stop();
      // Only stop the mic, DON'T auto-send. Let the user review and click send manually.
    } else {
      setInputText('');
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setMicStatus('❌ Microphone access denied. Please allow it in your browser settings and try again.');
        return;
      }
      const recognition = initRecognition();
      if (!recognition) return;
      recognitionRef.current = recognition;
      shouldListenRef.current = true; // Enable auto-restart
      recognition.start();
    }
  };

  // Welcome splash — shown before session starts
  if (!sessionStarted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <audio ref={audioRef} style={{ display: 'none' }} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel"
          style={{ maxWidth: '500px', width: '100%', padding: '60px 40px', textAlign: 'center' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <img 
              src="/sarah-avatar.png" 
              alt="Sarah - Luxury Travel Concierge" 
              style={{ 
                width: '300px', 
                height: '300px', 
                borderRadius: '50%', 
                objectFit: 'cover', 
                border: '3px solid rgba(139, 92, 246, 0.4)', 
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)' 
              }} 
            />
          </div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>
            Meet <span className="text-gradient">Sarah</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '40px', lineHeight: 1.6 }}>
            Your exclusive AI travel concierge. She'll discuss your dreams, handle the details, and curate a remarkably elegant itinerary just for you.
          </p>
          <button
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontSize: '1.2rem', padding: '18px 32px' }}
            onClick={() => setSessionStarted(true)}
          >
            Start chatting with Sarah <Star size={20} />
          </button>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '16px' }}>
            🎙️ Sarah can hear and speak — make sure your volume is on!
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: '2rem' }}>
      {/* Hidden audio element for TTS streaming */}
      <audio ref={audioRef} style={{ display: 'none' }} />

      <nav className="container" style={{ display: 'flex', justifyContent: 'center', padding: '0 0 24px 0' }}>
        <h1 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Star className="text-gradient" />
          <span>Sarah - AI Itinerary Agent</span>
        </h1>
      </nav>

      <main className="container chat-container glass-panel p-0" style={{ overflow: 'hidden' }}>
        <div className="chat-messages">
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                id={`msg-${msg.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`message-wrapper ${msg.sender === 'sarah' ? 'wrapper-sarah' : 'wrapper-user'}`}
                style={msg.showItinerary ? { maxWidth: '100%', width: '100%' } : {}}
              >
                {msg.sender === 'sarah' && (
                   <img src="/sarah-avatar.png" alt="Sarah, your AI travel concierge" className="sarah-avatar" />
                )}
                <div className={`message-bubble ${msg.sender === 'sarah' ? 'message-sarah' : 'message-user'}`} style={msg.showItinerary ? { flexGrow: 1, maxWidth: 'calc(100% - 56px)' } : {}}>
                  {msg.sender === 'sarah' && <div style={{ fontSize: '0.8rem', color: 'var(--accent-purple)', marginBottom: '8px', fontWeight: 'bold' }}>Sarah, Travel Concierge</div>}
                  {msg.text}
                
                {msg.showItinerary && (
                  <div id={`itinerary-${msg.id}`} style={{ marginTop: '24px', display: 'flex', flexDirection: 'column' }}>

                    {/* Visual Journey Process Links */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '32px', gap: '8px', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '8px', width: '100%' }}>
                      {msg.transport && (
                        <a href="#card-transport" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-main)', textDecoration: 'none', transition: 'transform 0.2s', flexShrink: 0 }} onMouseOver={e => e.currentTarget.style.transform='scale(1.1)'} onMouseOut={e => e.currentTarget.style.transform='scale(1)'}>
                           <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#00d2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0, 210, 255, 0.4)' }}>
                             {msg.transport.type.toLowerCase().includes('flight') ? <Plane size={24}/> : msg.transport.type.toLowerCase().includes('train') ? <Train size={24}/> : <Car size={24}/>}
                           </div>
                           <span style={{ fontSize: '0.75rem', marginTop: '8px', fontWeight: 'bold' }}>DEPART</span>
                        </a>
                      )}

                      {msg.transfer && msg.transport && (
                        <div style={{ height: '2px', width: '40px', minWidth: '20px', background: 'rgba(255,255,255,0.2)', marginBottom: '20px', flexShrink: 1 }}></div>
                      )}

                      {msg.transfer && (
                        <a href="#card-transfer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-main)', textDecoration: 'none', transition: 'transform 0.2s', flexShrink: 0 }} onMouseOver={e => e.currentTarget.style.transform='scale(1.1)'} onMouseOut={e => e.currentTarget.style.transform='scale(1)'}>
                           <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#b983ff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(185, 131, 255, 0.4)' }}>
                             {msg.transfer.type.toLowerCase().includes('train') ? <Train size={24}/> : <Car size={24}/>}
                           </div>
                           <span style={{ fontSize: '0.75rem', marginTop: '8px', fontWeight: 'bold' }}>TRANSFER</span>
                        </a>
                      )}

                      {msg.hotel && (msg.transport || msg.transfer) && (
                        <div style={{ height: '2px', width: '40px', minWidth: '20px', background: 'rgba(255,255,255,0.2)', marginBottom: '20px', flexShrink: 1 }}></div>
                      )}

                      {msg.hotel && (
                        <a href="#card-hotel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-main)', textDecoration: 'none', transition: 'transform 0.2s', flexShrink: 0 }} onMouseOver={e => e.currentTarget.style.transform='scale(1.1)'} onMouseOut={e => e.currentTarget.style.transform='scale(1)'}>
                           <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)' }}>
                             <Bed size={24}/>
                           </div>
                           <span style={{ fontSize: '0.75rem', marginTop: '8px', fontWeight: 'bold' }}>STAY</span>
                        </a>
                      )}

                      {msg.restaurant && msg.hotel && (
                        <div style={{ height: '2px', width: '40px', minWidth: '20px', background: 'rgba(255,255,255,0.2)', marginBottom: '20px', flexShrink: 1 }}></div>
                      )}

                      {msg.restaurant && (
                        <a href="#card-restaurant" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-main)', textDecoration: 'none', transition: 'transform 0.2s', flexShrink: 0 }} onMouseOver={e => e.currentTarget.style.transform='scale(1.1)'} onMouseOut={e => e.currentTarget.style.transform='scale(1)'}>
                           <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#ff4d4d', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(255, 77, 77, 0.4)' }}>
                             <Coffee size={24}/>
                           </div>
                           <span style={{ fontSize: '0.75rem', marginTop: '8px', fontWeight: 'bold' }}>DINE</span>
                        </a>
                      )}
                    </div>
                    
                    <div style={{ marginBottom: '24px', paddingLeft: '8px' }}>
                      <h3 style={{ fontSize: '1.8rem', fontWeight: '300', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontWeight: '800' }}>Sarah's</span> Curated Itinerary
                      </h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '4px' }}>She has carefully selected the following sequence for your journey.</p>
                    </div>

                    {/* The Cards Grid */}
                    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: '16px', alignItems: 'stretch', overflowX: 'auto', paddingBottom: '16px', width: '100%' }}>
                      {msg.transport && (
                        <div id="card-transport" style={{ flex: 1, minWidth: '260px', padding: '24px', borderRadius: '16px', border: '1px solid rgba(0, 210, 255, 0.2)', boxShadow: '0 8px 32px rgba(0, 210, 255, 0.1)', background: 'linear-gradient(145deg, rgba(0, 210, 255, 0.15) 0%, rgba(9, 9, 11, 0.9) 100%)', scrollMarginTop: '20px', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00d2ff', fontWeight: '800', marginBottom: '12px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                              {msg.transport.type.toLowerCase().includes('flight') ? <Plane size={16} /> : msg.transport.type.toLowerCase().includes('train') ? <Train size={16} /> : <Car size={16} />} DEPARTURE DETAILS
                            </div>
                            <h4 style={{ fontSize: '1.4rem', marginBottom: '4px', fontWeight: '800', lineHeight: '1.2' }}>
                              {msg.transport.origin} <ChevronRight size={16} style={{display: 'inline', color: 'var(--text-muted)', verticalAlign: 'middle'}} /> {msg.transport.destination}
                            </h4>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px', textTransform: 'capitalize' }}>{msg.transport.type}</div>
                            <p style={{ fontSize: '0.9rem', marginBottom: '16px', opacity: 0.85, fontStyle: 'italic' }}>
                              &ldquo;{msg.transport.reason}&rdquo;
                            </p>
                            <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                              <a href={msg.transport.type.toLowerCase().includes('flight') ? (msg.transport.origin_iata && msg.transport.destination_iata && msg.booking ? `https://www.skyscanner.net/transport/flights/${msg.transport.origin_iata.toLowerCase()}/${msg.transport.destination_iata.toLowerCase()}/${msg.booking.checkin.slice(2).replace(/-/g, '')}/${msg.booking.checkout.slice(2).replace(/-/g, '')}/` : `https://www.skyscanner.net/`) : msg.transport.type.toLowerCase().includes('train') ? `https://www.thetrainline.com/` : `https://www.uber.com/`} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px 6px 6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'white', textDecoration: 'none', fontSize: '0.95rem', fontWeight: '600', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#00d2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0, 210, 255, 0.4)' }}>
                                    {msg.transport.type.toLowerCase().includes('flight') ? <Plane size={18}/> : msg.transport.type.toLowerCase().includes('train') ? <Train size={18}/> : <Car size={18}/>}
                                  </div>
                                  View Details
                                </div>
                                <ChevronRight size={18} />
                              </a>
                            </div>
                          </div>
                        </div>
                      )}

                      {msg.transfer && (
                        <div id="card-transfer" style={{ flex: 1, minWidth: '260px', padding: '24px', borderRadius: '16px', border: '1px solid rgba(185, 131, 255, 0.2)', boxShadow: '0 8px 32px rgba(185, 131, 255, 0.1)', background: 'linear-gradient(145deg, rgba(185, 131, 255, 0.15) 0%, rgba(9, 9, 11, 0.9) 100%)', scrollMarginTop: '20px', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b983ff', fontWeight: '800', marginBottom: '12px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                              {msg.transfer.type.toLowerCase().includes('train') ? <Train size={16} /> : <Car size={16} />} AIRPORT TRANSFER
                            </div>
                            <h4 style={{ fontSize: '1.4rem', marginBottom: '4px', fontWeight: '800', lineHeight: '1.2' }}>
                              {msg.transfer.origin} <ChevronRight size={16} style={{display: 'inline', color: 'var(--text-muted)', verticalAlign: 'middle'}} /> {msg.transfer.destination}
                            </h4>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px', textTransform: 'capitalize' }}>{msg.transfer.type}</div>
                            <p style={{ fontSize: '0.9rem', marginBottom: '16px', opacity: 0.85, fontStyle: 'italic' }}>
                              &ldquo;{msg.transfer.reason}&rdquo;
                            </p>
                            {msg.transfer.type.toLowerCase().includes('train') ? (
                              <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                                <a href="https://www.thetrainline.com/" target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px 6px 6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'white', textDecoration: 'none', fontSize: '0.95rem', fontWeight: '600', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#b983ff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(185, 131, 255, 0.4)' }}>
                                      <Train size={18}/>
                                    </div>
                                    View Details
                                  </div>
                                  <ChevronRight size={18} />
                                </a>
                              </div>
                            ) : (
                              <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <a href={`https://www.google.com/search?q=${encodeURIComponent((msg.transfer.local_taxi_company || 'Taxi') + ' ' + msg.transfer.destination)}`} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px 6px 6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'white', textDecoration: 'none', fontSize: '0.85rem', fontWeight: '600', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#b983ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <Car size={14}/>
                                    </div>
                                    {msg.transfer.local_taxi_company ? `Local: ${msg.transfer.local_taxi_company}` : 'Search Local Taxis'}
                                  </div>
                                  <ChevronRight size={14} />
                                </a>
                                <a href="https://www.uber.com/" target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px 6px 6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'white', textDecoration: 'none', fontSize: '0.85rem', fontWeight: '600', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#b983ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <Car size={14}/>
                                    </div>
                                    Uber
                                  </div>
                                  <ChevronRight size={14} />
                                </a>
                                <a href="https://www.booking.com/taxi/" target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px 6px 6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'white', textDecoration: 'none', fontSize: '0.85rem', fontWeight: '600', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#b983ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <Car size={14}/>
                                    </div>
                                    Booking.com Taxi
                                  </div>
                                  <ChevronRight size={14} />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                     {msg.hotel && (
                       <div id="card-hotel" style={{ flex: 1, minWidth: '260px', padding: '24px', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.4)', boxShadow: '0 8px 32px rgba(59, 130, 246, 0.1)', background: 'linear-gradient(145deg, rgba(59, 130, 246, 0.3) 0%, rgba(9, 9, 11, 0.9) 100%)', scrollMarginTop: '20px', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6', fontWeight: '800', marginBottom: '12px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                              <Bed size={16} /> ACCOMMODATION
                            </div>
                            <h4 style={{ fontSize: '1.4rem', marginBottom: '8px', fontWeight: '800', lineHeight: '1.2' }}>{msg.hotel.name}</h4>
                            {msg.booking && (
                              <div style={{ fontSize: '0.85rem', color: '#e2e8f0', marginBottom: '8px', display: 'flex', gap: '12px' }}>
                                <span>📅 {msg.booking.checkin} to {msg.booking.checkout}</span>
                                <span>👥 {msg.booking.adults} Adults, {msg.booking.rooms} Room{msg.booking.rooms > 1 ? 's' : ''}</span>
                              </div>
                            )}
                            {msg.hotel.rating && <div style={{ color: '#fbbf24', fontSize: '0.9rem', marginBottom: '12px' }}>⭐ Rated {msg.hotel.rating}</div>}
                            <p style={{ fontSize: '0.9rem', marginBottom: '16px', opacity: 0.85, fontStyle: 'italic' }}>
                              &ldquo;{msg.hotel.reason}&rdquo;
                            </p>
                            <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                              <a 
                                href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(msg.hotel.name + (msg.hotel.location ? `, ${msg.hotel.location}` : ''))}${msg.booking ? `&checkin=${msg.booking.checkin}&checkout=${msg.booking.checkout}&group_adults=${msg.booking.adults}&no_rooms=${msg.booking.rooms}` : ''}`} 
                                target="_blank" 
                                rel="noopener" 
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px 6px 6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'white', textDecoration: 'none', fontSize: '0.95rem', fontWeight: '600', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)' }}>
                                    <Bed size={18}/>
                                  </div>
                                  Check Live Availability
                                </div>
                                <ChevronRight size={18} />
                              </a>
                            </div>
                          </div>
                        </div>
                     )}
 
                      {msg.restaurant && (
                        <div id="card-restaurant" style={{ flex: 1, minWidth: '260px', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255, 77, 77, 0.2)', boxShadow: '0 8px 32px rgba(255, 77, 77, 0.1)', background: 'linear-gradient(145deg, rgba(255, 77, 77, 0.15) 0%, rgba(9, 9, 11, 0.9) 100%)', scrollMarginTop: '20px', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ff4d4d', fontWeight: '800', marginBottom: '12px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                              <Coffee size={16} /> EVENING DINING
                            </div>
                            <h4 style={{ fontSize: '1.4rem', marginBottom: '4px', fontWeight: '800', lineHeight: '1.2' }}>{msg.restaurant.name}</h4>
                            {msg.restaurant.cuisine && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>{msg.restaurant.cuisine} cuisine</div>}
                            <p style={{ fontSize: '0.9rem', marginBottom: '16px', opacity: 0.85, fontStyle: 'italic' }}>
                              &ldquo;{msg.restaurant.reason}&rdquo;
                            </p>
                            <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                              <a href={`https://www.opentable.com/s?term=${encodeURIComponent(msg.restaurant.name + (msg.restaurant.location ? `, ${msg.restaurant.location}` : ''))}`} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px 6px 6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'white', textDecoration: 'none', fontSize: '0.95rem', fontWeight: '600', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#ff4d4d', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(255, 77, 77, 0.4)' }}>
                                    <Coffee size={18}/>
                                  </div>
                                  Reserve Table
                                </div>
                                <Check size={18} />
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {msg.itinerary_days && (
                      <div style={{ marginTop: '32px', padding: '0 8px' }}>
                        <h3 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>Trip Schedule</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {msg.itinerary_days.map((day, idx) => (
                            <div key={idx} style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                              <div style={{ minWidth: '120px' }}>
                                <div style={{ fontWeight: '800', color: '#b983ff', fontSize: '1.1rem' }}>{day.day_name}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{day.date}</div>
                              </div>
                              <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px' }}>
                                {day.activities && day.activities.length > 0 ? (
                                  <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-main)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                    {day.activities.map((act, i) => <li key={i}>{act}</li>)}
                                  </ul>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.95rem', fontStyle: 'italic', height: '100%' }}>
                                    <Sparkles size={16} /> Free day! Ask Sarah for recommendations to fill this space.
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                </div>
              </motion.div>
            ))}

            {isTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="message-wrapper wrapper-sarah"
              >
                <img src="/sarah-avatar.png" alt="Sarah typing..." className="sarah-avatar" />
                <div className="message-bubble message-sarah typing-indicator">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </motion.div>
            )}
            
            {isSynthesizing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="message-wrapper wrapper-sarah"
              >
                <img src="/sarah-avatar.png" alt="Sarah speaking" className="sarah-avatar" style={{ opacity: 0.6 }} />
                <div className="message-bubble message-sarah typing-indicator" style={{ background: 'transparent', border: 'none' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-purple)' }}>Sarah is speaking...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area" style={{ flexDirection: 'column', gap: '8px' }}>
          {micStatus && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0 4px' }}>{micStatus}</div>
          )}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', width: '100%' }}>
            <button 
              className={`mic-btn ${isListening ? 'listening' : 'idle'}`}
              onClick={toggleMic}
              title={isListening ? 'Tap to pause listening...' : 'Tap once to speak (no need to hold)'}
            >
              {isListening ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            
            <textarea 
              className="chat-input" 
              placeholder={isListening ? 'Listening... Tap mic again to pause.' : 'Type a message or tap the mic to dictate...'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
            />
            
            <button className="send-btn" onClick={() => handleSend()} disabled={!inputText.trim()}>
              <Send size={24} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
