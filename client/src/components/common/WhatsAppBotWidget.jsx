import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FaWhatsapp, FaTimes, FaPaperPlane, FaHeadset, FaExternalLinkAlt, FaListUl } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { findBestMatch } from './whatsappFaqData';
import WidgetErrorBoundary from './WidgetErrorBoundary';

const WHATSAPP_NUMBER = '2348030601238';
const BOT_DELAY = 1000;
const GREETING_DELAY = 6000;

const CONFIRM_WORDS = ['yes', 'yeah', 'yep', 'okay', 'ok', 'sure', 'alright', 'please', 'yea', 'go ahead'];
const MENU_WORDS = ['menu', 'options', 'back', 'show options', 'show menu', 'what can you do', 'help'];
const NO_WORDS = ['no', 'nope', 'nah', 'not really', 'nothing', 'that\'s all', 'that is all', 'no thanks', 'all good', 'im good', 'i\'m good', 'not now'];
const THANKS_WORDS = ['thanks', 'thank you', 'thank', 'thx', 'cool', 'ok thanks', 'okay thanks', 'alright thanks', 'got it', 'understood', 'i see'];

const isConfirmation = (text) => {
  const clean = text.toLowerCase().replace(/[^a-z ]/g, '').trim();
  return CONFIRM_WORDS.some((w) => clean === w || clean.startsWith(w + ' ') || clean.endsWith(' ' + w));
};

const isMenuRequest = (text) => {
  const clean = text.toLowerCase().replace(/[^a-z ]/g, '').trim();
  return MENU_WORDS.some((w) => clean === w || clean.startsWith(w + ' ') || clean.endsWith(' ' + w));
};

const isNegative = (text) => {
  const clean = text.toLowerCase().replace(/[^a-z ]/g, '').trim();
  return NO_WORDS.some((w) => clean === w || clean.startsWith(w + ' ') || clean.endsWith(' ' + w));
};

const isAcknowledgment = (text) => {
  const clean = text.toLowerCase().replace(/[^a-z ]/g, '').trim();
  return THANKS_WORDS.some((w) => clean === w || clean.startsWith(w + ' ') || clean.endsWith(' ' + w));
};

const WhatsAppBotWidget = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showGreeting, setShowGreeting] = useState(false);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [connectedToAgent, setConnectedToAgent] = useState(false);
  const [askedQuestion, setAskedQuestion] = useState(false);
  const [awaitingResponse, setAwaitingResponse] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const greetingTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const awaitingRef = useRef(null);
  const widgetRef = useRef(null);
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
  const prefersReducedMotion = useReducedMotion();
  const formatTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    awaitingRef.current = awaitingResponse;
  }, [awaitingResponse]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    greetingTimerRef.current = setTimeout(() => {
      if (mountedRef.current && !open) {
        setShowGreeting(true);
        setTimeout(() => { if (mountedRef.current) setShowGreeting(false); }, 4000);
      }
    }, GREETING_DELAY);
    return () => {
      mountedRef.current = false;
      clearTimeout(greetingTimerRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setShowGreeting(false);
      if (!askedQuestion) {
        setIsBotTyping(true);
        setTimeout(() => {
          if (mountedRef.current) {
            setMessages([{
              id: 'bot-greeting',
              type: 'bot',
              text: t('messages.whatsapp.bot_greeting', "Hi! I'm RentalHub\u2019s virtual assistant. How can I help you today?"),
              showQuickReplies: true,
              created_at: new Date().toISOString(),
            }]);
            setIsBotTyping(false);
            setAskedQuestion(true);
          }
        }, BOT_DELAY);
      }
    }
  }, [open, askedQuestion, t]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isBotTyping, scrollToBottom]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [open]);

  // Close other widget on mobile when this opens
  const widgetInstanceId = useRef(`wbw-${Date.now()}`);
  useEffect(() => {
    if (!open) return;
    if (window.innerWidth < 640) {
      window.dispatchEvent(new CustomEvent('widget:close-other', { detail: { id: widgetInstanceId.current } }));
    }
  }, [open]);
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.id !== widgetInstanceId.current) setOpen(false);
    };
    window.addEventListener('widget:close-other', handler);
    return () => window.removeEventListener('widget:close-other', handler);
  }, []);

  // Focus trap + Escape + click-outside
  useEffect(() => {
    if (!open) return;
    const el = widgetRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', handleTab);
    const handleEscape = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handleEscape);
    const handleOutside = (e) => { if (widgetRef.current && !widgetRef.current.contains(e.target)) setOpen(false); };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleOutside), 0);
    return () => {
      el.removeEventListener('keydown', handleTab);
      document.removeEventListener('keydown', handleEscape);
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [open]);

  const addBotMessage = useCallback((text, faq, showQR) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `bot-${Date.now()}`,
        type: 'bot',
        text,
        created_at: new Date().toISOString(),
        link: faq?.link || null,
        linkText: faq?.linkText || null,
        showQuickReplies: showQR || false,
      },
    ]);
  }, []);

  const addUserMessage = useCallback((text) => {
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, type: 'user', text, created_at: new Date().toISOString() },
    ]);
  }, []);

  const botReplyWithTyping = useCallback((callback) => {
    setTimeout(() => {
      if (!mountedRef.current) return;
      setIsBotTyping(true);
    }, 200);
    setTimeout(() => {
      if (!mountedRef.current) return;
      setIsBotTyping(false);
      callback();
    }, BOT_DELAY + 500);
  }, []);

  const showMenu = useCallback(() => {
    setAwaitingResponse(null);
    inputRef.current?.blur();
    botReplyWithTyping(() => {
      addBotMessage(t('messages.whatsapp.menu_prompt', 'Sure! What would you like to know about?'), null, true);
    });
  }, [addBotMessage, botReplyWithTyping, t]);

  const askAnythingElse = useCallback(() => {
    setAwaitingResponse('anything_else');
    setTimeout(() => {
      if (!mountedRef.current) return;
      setIsBotTyping(true);
      setTimeout(() => {
        if (!mountedRef.current) return;
        setIsBotTyping(false);
        addBotMessage(t('messages.whatsapp.anything_else', 'Is there anything else I can help you with?'));
      }, 600);
    }, 600);
  }, [addBotMessage, t]);

  const handleTalkToAgent = useCallback(() => {
    setConnectedToAgent(true);
    setAwaitingResponse(null);
    const waMsg = t('home.whatsapp_message', 'Hello RentalHub NG, I need help finding a home.');
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMsg)}%0A%0A${encodeURIComponent(window.location.href)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [t]);

  const handleSend = useCallback(
    (text) => {
      const msg = (text || input).trim();
      if (!msg) return;
      setInput('');
      addUserMessage(msg);

      const currentAwaiting = awaitingRef.current;

      if (currentAwaiting === 'anything_else' && isConfirmation(msg)) {
        setAwaitingResponse(null);
        botReplyWithTyping(() => {
          addBotMessage(t('messages.whatsapp.menu_prompt', 'Sure! What would you like to know about?'), null, true);
        });
        return;
      }

      if (isMenuRequest(msg)) {
        setAwaitingResponse(null);
        botReplyWithTyping(() => {
          addBotMessage(t('messages.whatsapp.menu_prompt', 'Sure! What would you like to know about?'), null, true);
        });
        return;
      }

      if (isNegative(msg)) {
        setAwaitingResponse(null);
        botReplyWithTyping(() => {
          addBotMessage(t('messages.whatsapp.dismissed', 'Alright! Feel free to come back anytime.'));
        });
        return;
      }

      if (currentAwaiting === 'handoff' && isConfirmation(msg)) {
        botReplyWithTyping(() => {
          handleTalkToAgent();
        });
        return;
      }

      if (isAcknowledgment(msg)) {
        setAwaitingResponse(null);
        botReplyWithTyping(() => {
          addBotMessage(t('messages.whatsapp.youre_welcome', 'You\u2019re welcome! Happy to help.'));
        });
        return;
      }

      setAwaitingResponse(null);

      const match = findBestMatch(msg);
      if (match) {
        botReplyWithTyping(() => {
          addBotMessage(match.answer, match);
          askAnythingElse();
        });
      } else {
        setAwaitingResponse('handoff');
        botReplyWithTyping(() => {
          addBotMessage(
            t('messages.whatsapp.no_match', "I\u2019m not sure I have the answer to that. Would you like to speak with a human agent? Just say yes.")
          );
        });
      }
    },
    [input, addUserMessage, addBotMessage, botReplyWithTyping, t, askAnythingElse, handleTalkToAgent]
  );

  const handleQuickReply = useCallback(
    (question) => {
      addUserMessage(question);
      setAwaitingResponse(null);

      const match = findBestMatch(question);
      if (match) {
        botReplyWithTyping(() => {
          addBotMessage(match.answer, match);
          askAnythingElse();
        });
      }
    },
    [addUserMessage, addBotMessage, botReplyWithTyping, askAnythingElse]
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickReplies = [
    t('messages.whatsapp.qr_find', 'How do I find a property?'),
    t('messages.whatsapp.qr_list', 'How do I list my property?'),
    t('messages.whatsapp.qr_legal', 'Tell me about Legal Protection'),
    t('messages.whatsapp.qr_payment', 'How does payment work?'),
  ];

  return (
    <WidgetErrorBoundary name="WhatsAppBotWidget">
      <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-2">
        <AnimatePresence>
          {showGreeting && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="relative bg-white rounded-xl shadow-xl p-3 max-w-[220px]"
            >
              <div className="absolute -bottom-1.5 left-5 w-3 h-3 bg-white rotate-45" />
              <p className="text-sm text-gray-700 font-medium">
                {t('messages.whatsapp.greeting_bubble', 'Need help? Chat with us!')}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          aria-label={t('messages.whatsapp.open', 'Open WhatsApp assistant')}
          className={`flex items-center justify-center w-14 h-14 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95 ${
            !open ? 'animate-bounce' : ''
          }`}
        >
          {open ? (
            <FaTimes className="w-6 h-6" />
          ) : (
            <FaWhatsapp className="w-7 h-7" />
          )}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={widgetRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('messages.whatsapp.title', 'RentalHub Assistant')}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed bottom-24 left-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
            style={{ maxHeight: '480px' }}
          >
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <FaWhatsapp className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold text-sm truncate">
                  {t('messages.whatsapp.title', 'RentalHub Assistant')}
                </h3>
                <p className="text-green-200 text-xs">
                  {t('messages.whatsapp.subtitle', 'Need help? Chat with us!')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/80 hover:text-white transition-colors"
                aria-label={t('messages.whatsapp.close', 'Close')}
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                      msg.type === 'user'
                        ? 'bg-green-500 text-white rounded-br-sm'
                        : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm'
                    }`}
                  >
                    {msg.type === 'bot' && (
                      <span className="flex items-center gap-1.5 mb-1">
                        <img src="/rentalhub-mark.svg" alt="" className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-semibold text-green-700 tracking-wide">
                          {t('messages.whatsapp.bot_label', 'RentalHub')}
                        </span>
                      </span>
                    )}
                    <p className="text-sm">{msg.text}</p>
                    {msg.created_at && (
                      <p className={`text-[10px] mt-1 ${msg.type === 'user' ? 'text-green-200' : 'text-gray-400'}`}>
                        {formatTime(new Date(msg.created_at))}
                      </p>
                    )}
                    {msg.link && (
                      <a
                        href={msg.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs bg-green-100 text-green-700 rounded-full px-3 py-1.5 hover:bg-green-200 transition-colors font-medium"
                      >
                        <FaExternalLinkAlt className="w-2.5 h-2.5" />
                        {msg.linkText || 'Visit page'}
                      </a>
                    )}
                    {msg.showQuickReplies && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {quickReplies.map((qr, i) => (
                          <button
                            key={i}
                            type="button"
                            onPointerDown={(e) => { e.preventDefault(); handleQuickReply(qr); }}
                            className="text-xs bg-white border border-green-300 text-green-700 rounded-full px-3 py-1.5 hover:bg-green-50 hover:border-green-400 transition-colors touch-action-manipulation cursor-pointer select-none"
                          >
                            {qr}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isBotTyping && (
                <div className="flex justify-start">
                  <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {connectedToAgent && (
                <div className="flex justify-center">
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center max-w-[90%]">
                    <FaHeadset className="w-5 h-5 text-green-600 mx-auto mb-1" />
                    <p className="text-sm text-green-800 font-medium">
                      {t('messages.whatsapp.connected', 'Connected to agent on WhatsApp')}
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      {t('messages.whatsapp.connected_sub', 'Continue your conversation there')}
                    </p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-gray-200 p-3 bg-white shrink-0">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('messages.whatsapp.input_placeholder', 'Type your question...')}
                  className="flex-1 h-[36px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={connectedToAgent}
                />
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || connectedToAgent}
                  className="h-[36px] w-[36px] flex items-center justify-center bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  aria-label={t('messages.whatsapp.send', 'Send')}
                >
                  <FaPaperPlane className="w-3.5 h-3.5" />
                </button>
              </div>

              {!connectedToAgent && (
                <div className="mt-2 text-center">
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); showMenu(); }}
                    className="text-xs text-green-600 hover:text-green-700 underline underline-offset-2 transition-colors touch-action-manipulation cursor-pointer select-none"
                  >
                    <FaListUl className="w-3 h-3 inline mr-1" />
                    {t('messages.whatsapp.menu_btn', 'Menu')}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </WidgetErrorBoundary>
  );
};

export default WhatsAppBotWidget;
