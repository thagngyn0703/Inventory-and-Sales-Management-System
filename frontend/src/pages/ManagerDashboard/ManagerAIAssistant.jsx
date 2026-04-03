import React from 'react';
import { Platform } from 'react-bits/lib/modules/Platform';
import ManagerSidebar from './ManagerSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import AIInsightCard from '../../components/AIInsightCard';
import AIChatPanel from '../../components/AIChatPanel';
import { Badge } from '../../components/ui/badge';
import { ShinyText } from '../../components/ai/ShinyText';
import './ManagerDashboard.css';
import './ManagerProducts.css';
import './ManagerAIAssistant.css';

/**
 * Trang Trợ lý AI — Tailwind + shadcn + hiệu ứng kiểu React Bits (ShinyText, grain web-only).
 */
export default function ManagerAIAssistant() {
  return (
    <div className="manager-page-with-sidebar">
      <ManagerSidebar />
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-search-wrap" />
          <div className="manager-topbar-actions" style={{ marginLeft: 'auto' }}>
            <ManagerNotificationBell />
            <div className="manager-user-badge">
              <i className="fa-solid fa-circle-user" style={{ color: '#6366f1' }} />
              <span>Quản lý</span>
            </div>
          </div>
        </header>

        <div className="manager-content pb-10">
          {/* Hero */}
          <div className="manager-ai-hero-wrap mb-8 border border-white/10 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 shadow-glow">
            {Platform.select({
              web: <div className="manager-ai-hero-noise" aria-hidden />,
              /* CRA / RN-web: đôi khi OS chưa inject — vẫn hiện noise trên trình duyệt */
              default:
                typeof window !== 'undefined' ? (
                  <div className="manager-ai-hero-noise" aria-hidden />
                ) : null,
            })}
            <div className="manager-ai-blob manager-ai-blob--1" aria-hidden />
            <div className="manager-ai-blob manager-ai-blob--2" aria-hidden />

            <div className="relative z-10 px-6 py-10 md:px-10 md:py-12">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Badge className="border-0 bg-teal-500/20 text-teal-200 ring-1 ring-teal-400/30">
                  DSS + LLM
                </Badge>
                <Badge className="border-0 bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/25">
                  Theo cửa hàng của bạn
                </Badge>
              </div>

              <h1 className="text-3xl md:text-4xl lg:text-[2.75rem] font-black leading-[1.15] tracking-tight text-white mb-3">
                <ShinyText as="span" className="block md:inline md:mr-2">
                  Trợ lý AI
                </ShinyText>
                <span className="text-slate-200 font-bold text-2xl md:text-3xl lg:text-[2.25rem]">
                  nhập hàng &amp; tồn kho
                </span>
              </h1>

              <p className="max-w-2xl text-sm md:text-base text-slate-400 leading-relaxed">
                Gợi ý theo ngày tự động và hỏi đáp tự nhiên — luôn gắn với{' '}
                <span className="text-teal-300/90 font-medium">dữ liệu kho</span>,{' '}
                <span className="text-violet-300/90 font-medium">lịch &amp; mùa vụ</span> và{' '}
                <span className="text-slate-300 font-medium">thời tiết</span> (khi đã cấu hình API).
              </p>
            </div>
          </div>

          {/* Hai cột: insights + chat */}
          <div className="grid grid-cols-1 gap-6 lg:gap-8 lg:grid-cols-2 items-stretch">
            <div className="min-w-0 flex flex-col">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-600/80 mb-2 px-1">
                Phân tích nhanh
              </p>
              <div className="flex-1 min-h-0">
                <AIInsightCard className="h-full" />
              </div>
            </div>
            <div className="min-w-0 flex flex-col">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-700/90 mb-2 px-1">
                Hội thoại
              </p>
              <div className="flex-1 min-h-0">
                <AIChatPanel className="h-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
