import React,{useEffect,useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {useTranslation} from 'react-i18next';
import {FaTimes} from 'react-icons/fa';
let openDialogs=0,originalOverflow='';
export default function Modal({isOpen,onClose,title,children,size='medium',footer,busy=false,layer='normal'}) {
  const {t}=useTranslation(),titleId=useId(),panel=useRef(null);
  useEffect(()=>{
    if(!isOpen)return;
    const previous=document.activeElement;
    if(openDialogs++===0){originalOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
    const target=panel.current?.querySelector('input:not([type="hidden"]),textarea,select')||panel.current;
    target?.focus();
    return()=>{if(--openDialogs===0)document.body.style.overflow=originalOverflow;if(previous?.isConnected)previous.focus?.();};
  },[isOpen]);
  if(!isOpen)return null;
  const sizes={small:'max-w-md',medium:'max-w-2xl',large:'max-w-4xl',full:'max-w-6xl'};
  const close=()=>{if(!busy)onClose?.();};
  const keyDown=event=>{
    if(event.key==='Escape'){event.stopPropagation();close();}
    if(event.key!=='Tab')return;
    const nodes=[...panel.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(node=>node.getClientRects().length);
    if(!nodes.length){event.preventDefault();panel.current.focus();return;}
    const first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel.current)){event.preventDefault();first.focus();}
  };
  return createPortal(<div className={`fixed inset-0 flex items-center justify-center p-4 ${layer==='security'?'z-[11000]':'z-[9999]'}`}><div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={close} aria-hidden="true"/><div ref={panel} role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby={titleId} tabIndex={-1} onKeyDown={keyDown} className={`relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl outline-none supports-[height:100dvh]:max-h-[calc(100dvh-2rem)] ${sizes[size]||sizes.medium}`}><header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6"><h2 id={titleId} className="pt-2 text-lg font-semibold leading-6 text-slate-900">{title}</h2><button type="button" onClick={close} disabled={busy} aria-label={t('modal.close','Close')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"><FaTimes aria-hidden="true"/></button></header><div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>{footer && <footer className="shrink-0 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">{footer}</footer>}</div></div>,document.body);
}
