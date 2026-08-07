import React, { useEffect, useState } from 'react';
import { ExternalLink, MessageCircle, X } from 'lucide-react';
import { api, ContactSettings } from '../commercial';

interface ContactButtonProps {
  variant?: 'landing' | 'console';
}

export const ContactButton: React.FC<ContactButtonProps> = ({ variant = 'console' }) => {
  const [contact, setContact] = useState<ContactSettings | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<{ contact: ContactSettings }>('/api/contact-settings')
      .then(result => setContact(result.contact))
      .catch(() => setContact(null));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  if (!contact?.enabled) return null;
  const qrCodeSrc = contact.qrCodeUploaded ? '/api/contact-qr' : contact.qrCodeUrl;

  return <>
    <button type="button" className={`contact-footer-button contact-footer-button--${variant}`} onClick={() => setOpen(true)}>
      <MessageCircle /> {contact.buttonLabel || '联系我们'}
    </button>
    {open && <div className="contact-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-dialog-title">
        <header>
          <span className="contact-dialog-icon"><MessageCircle /></span>
          <div><small>SUPPORT</small><h2 id="contact-dialog-title">{contact.title || '联系我们'}</h2></div>
          <button type="button" onClick={() => setOpen(false)} title="关闭"><X /></button>
        </header>
        <div className="contact-dialog-body">
          {contact.description && <p className="contact-dialog-description">{contact.description}</p>}
          {contact.contactText && <div className="contact-dialog-text">{contact.contactText}</div>}
          {qrCodeSrc && <div className="contact-dialog-qr"><img src={qrCodeSrc} alt="联系二维码" /></div>}
          {contact.contactUrl && <a href={contact.contactUrl} target="_blank" rel="noreferrer">打开联系链接 <ExternalLink /></a>}
          {!contact.description && !contact.contactText && !qrCodeSrc && !contact.contactUrl && <p className="contact-dialog-empty">管理员暂未填写联系方式。</p>}
        </div>
      </section>
    </div>}
  </>;
};
