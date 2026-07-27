import React, { useEffect, useRef, useState } from 'react';
import { FaCopy, FaFacebookF, FaShareAlt, FaTelegramPlane, FaWhatsapp } from 'react-icons/fa';
import { toast } from 'react-toastify';

const copyToClipboard = async (text) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const ShareMenu = ({
  url,
  title,
  text,
  className = '',
  buttonClassName,
  buttonLabel = 'Share',
  buttonIcon,
  position = 'right',
  onShare,
  headerLabel = 'Share',
  copySuccessMessage = 'Link copied to clipboard',
  copyErrorMessage = 'Unable to copy link',
  shareErrorMessage = 'Unable to open share sheet',
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const shareUrl = typeof window !== 'undefined' ? (url || window.location.href) : (url || '');
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    try {
      await navigator.share({ title: title || '', text: text || '', url: shareUrl });
      setOpen(false);
      onShare?.();
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error(shareErrorMessage);
      }
    }
  };

  const handleCopyLink = async () => {
    try {
      await copyToClipboard(shareUrl);
      toast.success(copySuccessMessage);
      setOpen(false);
      onShare?.();
    } catch {
      toast.error(copyErrorMessage);
    }
  };

  const shareText = text || shareUrl;
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(shareUrl);

  const platforms = [
    {
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
      icon: <FaWhatsapp className="text-green-600" />,
      hoverClass: 'hover:bg-green-50 hover:text-green-700',
    },
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      icon: <FaFacebookF className="text-blue-600" />,
      hoverClass: 'hover:bg-blue-50 hover:text-blue-700',
    },
    {
      label: 'Telegram',
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      icon: <FaTelegramPlane className="text-sky-500" />,
      hoverClass: 'hover:bg-sky-50 hover:text-sky-700',
    },
    {
      label: 'X',
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
      icon: <span className="font-semibold text-gray-900">X</span>,
      hoverClass: 'hover:bg-gray-100 hover:text-gray-900',
    },
  ];

  return (
    <div ref={menuRef} className={`relative inline-block ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={buttonClassName || 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-primary-600 hover:border-primary-300 transition-all duration-200 shadow-sm'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {buttonIcon || <FaShareAlt className="text-xs" />}
        {buttonLabel}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute ${position === 'right' ? 'right-0' : 'left-0'} z-50 mt-2 w-52 origin-top-right animate-scaleIn rounded-xl border border-gray-100 bg-white py-2 shadow-elevated-lg`}
          >
            <div className="px-4 pb-2 mb-1 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-700">{headerLabel}</p>
            </div>

            {canNativeShare && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FaShareAlt className="text-gray-600" />
                Share via device
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyLink}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <FaCopy className="text-gray-500" />
              Copy link
            </button>

            <div className="my-1 border-t border-gray-100" />

            {platforms.map((p) => (
              <a
                key={p.label}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { setOpen(false); onShare?.(); }}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors ${p.hoverClass}`}
              >
                {p.icon}
                {p.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ShareMenu;
