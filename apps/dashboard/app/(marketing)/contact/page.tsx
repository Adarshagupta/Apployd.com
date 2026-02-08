'use client';

import { useState } from 'react';
import styles from '../../landing.module.css';

const methods = [
  { label: 'Email', value: 'hello@apployd.dev', icon: '✉' },
  { label: 'Sales', value: 'sales@apployd.dev', icon: '💼' },
  { label: 'Support', value: 'support@apployd.dev', icon: '🛟' },
  { label: 'GitHub', value: 'github.com/apployd', icon: '⌥' },
];

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <>
      {/* Hero */}
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Contact</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Get in touch
          </h1>
          <p style={{ maxWidth: 520, margin: '1rem auto 0', fontSize: '1.05rem', color: 'rgba(212,221,244,0.7)' }}>
            Questions, partnerships, or just want to say hi? We&apos;d love to hear from you.
          </p>
        </div>
      </section>

      {/* Contact Methods */}
      <section className={styles.section} style={{ paddingTop: 0, borderTop: 'none' }}>
        <div className={styles.container}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {methods.map((m) => (
              <div
                key={m.label}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.55)',
                  padding: '1.2rem',
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: '1.6rem', display: 'block', marginBottom: '0.5rem' }}>{m.icon}</span>
                <p style={{ margin: 0, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(200,210,240,0.5)', fontWeight: 600 }}>
                  {m.label}
                </p>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.88rem', color: 'rgba(220,228,248,0.8)' }}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section className={styles.section}>
        <div className={styles.container} style={{ maxWidth: 600 }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <span style={{ fontSize: '2.4rem', display: 'block', marginBottom: '1rem' }}>✓</span>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600 }}>Message sent!</h2>
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.95rem', color: 'rgba(200,210,240,0.6)' }}>
                We&apos;ll get back to you within 24 hours.
              </p>
            </div>
          ) : (
            <>
              <p className={styles.sectionLabel}>Send a message</p>
              <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', marginBottom: '1.8rem' }}>
                How can we help?
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(true);
                }}
                style={{ display: 'grid', gap: '1rem' }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <input
                    type="text"
                    placeholder="Name"
                    required
                    style={{
                      borderRadius: 10,
                      border: '1px solid rgba(161,178,216,0.2)',
                      background: 'rgba(8,10,16,0.7)',
                      color: '#f3f5fa',
                      fontSize: '0.9rem',
                      padding: '0.75rem 1rem',
                      outline: 'none',
                    }}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    required
                    style={{
                      borderRadius: 10,
                      border: '1px solid rgba(161,178,216,0.2)',
                      background: 'rgba(8,10,16,0.7)',
                      color: '#f3f5fa',
                      fontSize: '0.9rem',
                      padding: '0.75rem 1rem',
                      outline: 'none',
                    }}
                  />
                </div>
                <select
                  defaultValue=""
                  required
                  style={{
                    borderRadius: 10,
                    border: '1px solid rgba(161,178,216,0.2)',
                    background: 'rgba(8,10,16,0.7)',
                    color: '#f3f5fa',
                    fontSize: '0.9rem',
                    padding: '0.75rem 1rem',
                    outline: 'none',
                  }}
                >
                  <option value="" disabled>Select a subject</option>
                  <option value="general">General Inquiry</option>
                  <option value="sales">Sales</option>
                  <option value="support">Technical Support</option>
                  <option value="partnership">Partnership</option>
                  <option value="other">Other</option>
                </select>
                <textarea
                  placeholder="Your message..."
                  rows={5}
                  required
                  style={{
                    borderRadius: 10,
                    border: '1px solid rgba(161,178,216,0.2)',
                    background: 'rgba(8,10,16,0.7)',
                    color: '#f3f5fa',
                    fontSize: '0.9rem',
                    padding: '0.75rem 1rem',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="submit"
                  className={styles.primaryButton}
                  style={{ justifySelf: 'start' }}
                >
                  Send Message
                </button>
              </form>
            </>
          )}
        </div>
      </section>

      {/* Location */}
      <section className={styles.section}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Location</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)' }}>
            Built remotely, deployed everywhere
          </h2>
          <p style={{ maxWidth: 480, margin: '0.6rem auto 0', fontSize: '0.92rem', color: 'rgba(200,210,240,0.6)' }}>
            Apployd is a remote-first team. Our servers — and yours — span the globe.
          </p>
        </div>
      </section>
    </>
  );
}
