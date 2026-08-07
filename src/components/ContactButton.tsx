import React, { useEffect, useState } from 'react';
import { ExternalLink, Headphones, X } from 'lucide-react';
import { api, ContactSettings } from '../commercial';

export const ContactButton: React.FC = () => {
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
  if (!contact.contactText && !contact.contactUrl && !qrCodeSrc) return null;

  return <>
    <button type="button" className="contact-floating-button" onClick={() => setOpen(true)} aria-haspopup="dialog" title={contact.buttonLabel || '立即咨询'}>
      <Headphones /> <span>{contact.buttonLabel || '立即咨询'}</span>
    </button>
    {open && <div className="contact-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-dialog-title">
        <header>
          <span className="contact-dialog-icon"><Headphones /></span>
          <div><small>SUPPORT</small><h2 id="contact-dialog-title">{contact.title || '联系站长'}</h2></div>
          <button type="button" onClick={() => setOpen(false)} title="关闭"><X /></button>
        </header>
        <div className="contact-dialog-body">
          {contact.description && <p className="contact-dialog-description">{contact.description}</p>}
          {contact.contactText && <div className="contact-dialog-text">{contact.contactText}</div>}
          {qrCodeSrc && <div className="contact-dialog-qr"><img src={qrCodeSrc} alt="咨询二维码" /></div>}
          {contact.contactUrl && <a href={contact.contactUrl} target="_blank" rel="noreferrer">打开咨询链接 <ExternalLink /></a>}
        </div>
      </section>
    </div>}
  </>;
};
