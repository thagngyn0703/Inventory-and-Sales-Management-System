/**
 * Thẻ gợi ý AI — shadcn Card + Badge + Button, Tailwind, hiệu ứng glow.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Info,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ShinyText } from './ai/ShinyText';
import { cn } from '../lib/utils';

const API_BASE = 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

async function fetchInsights(forceRefresh = false) {
  const url = new URL(`${API_BASE}/ai/insights`);
  if (forceRefresh) url.searchParams.set('refresh', '1');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Lỗi tải gợi ý AI');
  return data;
}

const TYPE_CONFIG = {
  urgent: {
    icon: TrendingUp,
    bg: 'bg-red-50/90',
    border: 'border-red-200/80',
    iconColor: 'text-red-500',
    badgeClass: 'bg-red-100 text-red-800 border-red-200/60',
    label: 'Nhập gấp',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-50/95',
    border: 'border-amber-300/90',
    iconColor: 'text-amber-700',
    badgeClass: 'bg-amber-200 text-amber-950 border-amber-300/80',
    label: 'Lưu ý',
  },
  opportunity: {
    icon: Lightbulb,
    bg: 'bg-emerald-50/90',
    border: 'border-emerald-200/80',
    iconColor: 'text-emerald-600',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200/60',
    label: 'Cơ hội',
  },
  tip: {
    icon: Info,
    bg: 'bg-sky-50/90',
    border: 'border-sky-200/80',
    iconColor: 'text-sky-600',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-200/60',
    label: 'Mẹo',
  },
};

function getConfig(type) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.tip;
}

function InsightSkeleton() {
  return (
    <div className="space-y-3 animate-pulse pt-1">
      <div className="h-10 bg-gradient-to-r from-violet-100 to-fuchsia-100 rounded-lg" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
          <div className="w-9 h-9 rounded-full bg-slate-200 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2.5 bg-slate-200 rounded w-1/4" />
            <div className="h-2 bg-slate-200 rounded w-full" />
            <div className="h-2 bg-slate-200 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecommendationItem({ rec }) {
  const cfg = getConfig(rec.type);
  const Icon = cfg.icon;
  const metricTokens = String(rec?.content || '')
    .match(/(\d+%|~?\d+\s*ngay|SKU\s*[A-Za-z0-9-_]+|~?\d[\d.,]*\s*(?:d|đ))/gi)
    ?.slice(0, 3) || [];

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5',
        cfg.bg,
        cfg.border
      )}
    >
      <div className="p-2 rounded-xl bg-white/90 shadow-sm ring-1 ring-black/5 shrink-0">
        <Icon className={cn('w-4 h-4', cfg.iconColor)} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <Badge className={cn('mb-1.5 border font-semibold', cfg.badgeClass)}>{cfg.label}</Badge>
        <p className={cn('whitespace-pre-line text-sm leading-relaxed', rec.type === 'warning' ? 'text-amber-950' : 'text-slate-700')}>
          {rec.content}
        </p>
        {metricTokens.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {metricTokens.map((token, idx) => (
              <Badge
                key={`${token}-${idx}`}
                className="border border-slate-300/70 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
              >
                {token}
              </Badge>
            ))}
          </div>
        ) : null}
        {rec?.source_note ? (
          <p className="mt-2 text-[11px] font-medium text-slate-500">
            {rec.source_note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function AIInsightCard({ className = '' }) {
  const [state, setState] = useState('idle');
  const [data, setData] = useState(null);
  const [cached, setCached] = useState(false);
  const [generatedAt, setGeneratedAt] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (forceRefresh = false) => {
    setState('loading');
    setError('');
    try {
      const res = await fetchInsights(forceRefresh);
      setData(res.data);
      setCached(res.cached || false);
      setGeneratedAt(res.generatedAt || '');
      setState('success');
    } catch (e) {
      setError(e.message || 'Không thể tải gợi ý AI');
      setState('error');
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const analysisViews = data?.analysis_views || [];
  const overviewView = analysisViews.find((view) => view.id === 'overview') || analysisViews[0];
  const displayedRecommendations = overviewView?.recommendations || data?.recommendations || [];

  return (
    <div className={cn('relative h-full min-h-[320px]', className)}>
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-60 blur-sm bg-gradient-to-br from-violet-500 via-fuchsia-500 to-teal-400"
        aria-hidden
      />
      <Card className="relative flex h-full flex-col overflow-hidden rounded-2xl border-violet-200/70 bg-white/95 shadow-glow backdrop-blur-md">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="space-y-1 pr-2">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-violet-500/30">
                <Sparkles className="h-4 w-4" />
              </span>
              <span>
                <ShinyText as="span" className="text-lg font-bold text-transparent">
                  Insight
                </ShinyText>
                <span className="text-slate-800"> trong ngày</span>
              </span>
            </CardTitle>
            <CardDescription className="text-slate-500">
              Kho · mùa vụ · ngày lễ — cập nhật theo cửa hàng
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={() => load(true)}
            disabled={state === 'loading'}
            className="h-9 w-9 shrink-0 rounded-xl border-violet-200 p-0 text-violet-600 hover:bg-violet-50 hover:text-violet-800"
            title="Làm mới phân tích"
          >
            <RefreshCw className={cn('h-4 w-4', state === 'loading' && 'animate-spin')} />
          </Button>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col pt-0">
          {state === 'idle' && (
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
              <Sparkles className="mb-2 h-10 w-10 text-violet-200" />
              <p className="text-sm text-slate-400">Đang chuẩn bị gợi ý…</p>
            </div>
          )}

          {state === 'loading' && <InsightSkeleton />}

          {state === 'error' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
              <WifiOff className="h-10 w-10 text-slate-300" />
              <p className="max-w-xs text-center text-sm text-slate-500">{error}</p>
              <Button variant="premium" type="button" className="rounded-xl text-sm" onClick={() => load(false)}>
                Thử lại
              </Button>
            </div>
          )}

          {state === 'success' && data && (
            <div className="flex flex-1 flex-col space-y-3">
              {data.seasonal_trend && (
                <div className="rounded-xl border border-teal-200/60 bg-gradient-to-r from-teal-50/90 via-emerald-50/50 to-transparent px-4 py-3 ring-1 ring-teal-500/10">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700/80 mb-1">
                    Xu hướng &amp; bối cảnh
                  </p>
                  <p className="text-sm font-medium leading-snug text-teal-950">{data.seasonal_trend}</p>
                </div>
              )}

              {!!analysisViews.length && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {overviewView?.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {overviewView?.description}
                  </p>
                </div>
              )}

              <div className="space-y-2.5">
                {displayedRecommendations.map((rec, idx) => (
                  <RecommendationItem key={idx} rec={rec} />
                ))}
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-violet-100 pt-3">
                <span className="text-xs text-slate-400">
                  {cached ? `Cache · ${generatedAt}` : `Mới phân tích · ${generatedAt}`}
                </span>
                <Badge className="border-0 bg-violet-100 text-violet-800 ring-1 ring-violet-200/60">
                  Gemini → OpenAI
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
