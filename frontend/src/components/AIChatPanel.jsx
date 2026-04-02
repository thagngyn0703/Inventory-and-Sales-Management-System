/**
 * Hỏi–đáp Trợ lý AI — shadcn Card + Button + Badge, Tailwind.
 */
import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, Loader2, Bot, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ShinyText } from './ai/ShinyText';
import { cn } from '../lib/utils';

const API_BASE = 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

async function postChat(message) {
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) {
    throw new Error(data.message || 'Gửi quá nhanh, vui lòng đợi vài giây.');
  }
  if (!res.ok) throw new Error(data.message || 'Không gửi được câu hỏi');
  return data;
}

const SUGGESTIONS = [
  'Tháng tới tôi nên tập trung nhập nhóm hàng gì?',
  'Có sự kiện nào sắp tới cần chuẩn bị hàng không?',
  'Mặt hàng nào trong kho đang cần nhập gấp?',
];

export default function AIChatPanel({ className = '' }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || sending) return;
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setSending(true);
    try {
      const data = await postChat(trimmed);
      const reply = data.reply || 'Không có phản hồi.';
      const tag = data.source === 'fallback' ? '\n\n[Phản hồi dự phòng từ dữ liệu kho — chưa qua AI.]' : '';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply + tag }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Không thể trả lời: ${e.message || 'lỗi không xác định'}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className={cn('relative h-full min-h-[320px]', className)}>
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-55 blur-sm bg-gradient-to-br from-teal-400 via-cyan-500 to-violet-500"
        aria-hidden
      />
      <Card className="relative flex h-full max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-2xl border-teal-200/70 bg-white/95 shadow-glow-teal backdrop-blur-md">
        <CardHeader className="border-b border-teal-100/80 bg-gradient-to-r from-teal-50/80 to-cyan-50/40 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/25">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="text-lg text-slate-900">
                  <ShinyText as="span" className="text-lg font-bold">
                    Hỏi đáp
                  </ShinyText>
                  <span className="font-bold text-slate-800"> trực tiếp</span>
                </CardTitle>
                <CardDescription className="mt-1 text-slate-600">
                  Câu hỏi được kèm ngữ cảnh kho &amp; lịch cửa hàng bạn
                </CardDescription>
              </div>
            </div>
            <Badge className="shrink-0 border-0 bg-teal-500/15 text-teal-800 ring-1 ring-teal-400/30">
              Live
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
          <div
            className="min-h-[220px] flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-slate-50/80 to-white p-4"
            style={{ scrollbarGutter: 'stable' }}
          >
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Gợi ý câu hỏi
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      disabled={sending}
                      className="group text-left text-xs font-medium leading-snug rounded-full border border-teal-200/80 bg-white px-4 py-2.5 text-teal-900 shadow-sm transition-all hover:border-teal-400 hover:bg-teal-50/80 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {m.role === 'assistant' && (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 ring-2 ring-white shadow-sm">
                    <Bot className="h-4 w-4 text-teal-700" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm',
                    m.role === 'user'
                      ? 'rounded-br-md bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-violet-500/20'
                      : 'rounded-bl-md border border-slate-200/80 bg-white text-slate-800'
                  )}
                >
                  {m.content}
                </div>
                {m.role === 'user' && (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 ring-2 ring-white">
                    <User className="h-4 w-4 text-slate-600" />
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-sm text-teal-700/80">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="animate-pulse font-medium">Đang suy nghĩ…</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={onSubmit}
            className="border-t border-teal-100/90 bg-white/90 p-3 backdrop-blur-sm"
          >
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Nhập câu hỏi… (Enter gửi, Shift+Enter xuống dòng)"
                rows={2}
                disabled={sending}
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/30 disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
              />
              <Button
                type="submit"
                variant="premium"
                disabled={sending || !input.trim()}
                className="h-11 w-11 shrink-0 rounded-xl p-0 shadow-glow"
                aria-label="Gửi câu hỏi"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
