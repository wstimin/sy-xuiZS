import React, { useEffect, useState } from 'react';
import { ExternalLink, Headphones, QrCode, X } from 'lucide-react';
import { api, ContactMethod, ContactSettings } from '../commercial';

const contactTypeLabels: Record<ContactMethod['type'], string> = {
  wechat: '微信',
  qq: 'QQ',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  wecom: '企业微信',
  email: '邮箱',
  phone: '电话',
  discord: 'Discord',
  line: 'LINE',
  custom: '其他',
};

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
  const methods = contact.methods.filter(method => method.enabled && (method.value || method.contactUrl || method.qrCodeUrl || method.qrCodeUploaded));
  if (!methods.length) return null;

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
          <div className="contact-method-list">
            {methods.map(method => {
              const qrCodeSrc = method.qrCodeUploaded ? `/api/contact-methods/${encodeURIComponent(method.id)}/qr` : method.qrCodeUrl;
              return <article className="contact-method" key={method.id}>
                <div className="contact-method-main">
                  <span className="contact-method-type">{contactTypeLabels[method.type]}</span>
                  <div><h3>{method.name}</h3>{method.value && <p>{method.value}</p>}</div>
                </div>
                {qrCodeSrc && <div className="contact-method-qr"><img src={qrCodeSrc} alt={`${method.name}二维码`} /></div>}
                {method.contactUrl && <a href={method.contactUrl} target={method.contactUrl.startsWith('http') ? '_blank' : undefined} rel="noreferrer">联系此方式 <ExternalLink /></a>}
                {!qrCodeSrc && !method.contactUrl && <span className="contact-method-hint"><QrCode /> 请使用上方账号联系</span>}
              </article>;
            })}
          </div>
        </div>
      </section>
    </div>}
  </>;
};
