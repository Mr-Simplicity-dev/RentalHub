import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaCopy,
  FaFacebookF,
  FaShareAlt,
  FaTelegramPlane,
  FaWhatsapp,
} from 'react-icons/fa';
import { toast } from 'react-toastify';

const copyTextToClipboard = async (text) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const PropertyShareButton = ({ property, detailLink, className = '' }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const shareUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${detailLink}`;
  }, [detailLink]);

  const locationLabel = [property?.area, property?.city, property?.state_name]
    .filter(Boolean)
    .join(', ');
  const shareTitle = locationLabel
    ? `${property?.title} in ${locationLabel}`
    : property?.title || 'Property listing';
  const shareText = `Check out this property on RentalHub NG: ${shareTitle}`;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [open]);

  const handleCopyLink = async () => {
    try {
      await copyTextToClipboard(shareUrl);
      toast.success('Property link copied');
      setOpen(false);
    } catch (error) {
      toast.error('Unable to copy property link right now');
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator === 'undefined' || !navigator.share) {
      return;
    }

    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      });
      setOpen(false);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        toast.error('Unable to open the share sheet right now');
      }
    }
  };

  const shareTargets = [
    {
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
      icon: <FaWhatsapp className="text-green-600" />,
    },
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      icon: <FaFacebookF className="text-blue-600" />,
    },
    {
      label: 'Telegram',
      href: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
      icon: <FaTelegramPlane className="text-sky-500" />,
    },
    {
      label: 'X',
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
      icon: <span className="font-semibold text-gray-900">X</span>,
    },
  ];

  return (
    <div
      ref={menuRef}
      className={`relative ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="bg-white p-2 rounded-full shadow-md hover:bg-gray-100 transition-colors"
        aria-label="Share property"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FaShareAlt className="text-gray-600" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Share Listing
          </div>

          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
            >
              <FaShareAlt className="text-gray-600" />
              Share via device
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
          >
            <FaCopy className="text-gray-600" />
            Copy property link
          </button>

          {shareTargets.map((target) => (
            <a
              key={target.label}
              href={target.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              {target.icon}
              Share on {target.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default PropertyShareButton;
