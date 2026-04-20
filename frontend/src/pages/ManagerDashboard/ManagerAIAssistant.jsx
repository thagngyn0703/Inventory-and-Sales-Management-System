import React from 'react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import AIInsightCard from '../../components/AIInsightCard';
import AIChatPanel from '../../components/AIChatPanel';
import { Sparkles } from 'lucide-react';
import './ManagerDashboard.css';
import './ManagerProducts.css';

/**
 * Trang Trợ lý AI — khung tiêu đề đồng bộ staff; nội dung phân tích + chat.
 */
export default function ManagerAIAssistant() {
  return (
    <ManagerPageFrame showNotificationBell>
      <StaffPageShell
        eyebrow="Quản lý cửa hàng"
        eyebrowIcon={Sparkles}
        title="Trợ lý AI"
        subtitle="Gợi ý theo ngày và hỏi đáp — gắn với dữ liệu kho, lịch & mùa vụ và thời tiết."
      >
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-violet-200/80 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-900">
            Theo cửa hàng của bạn
          </span>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-6 lg:h-[calc(100vh-200px)] lg:min-h-[710px] lg:max-h-[960px] lg:grid-cols-2 lg:gap-8">
          <div className="flex min-h-0 min-w-0 flex-col">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-violet-700/90">Phân tích nhanh</p>
            <div className="min-h-0 flex-1 overflow-hidden">
              <AIInsightCard className="h-full" />
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-col">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-teal-800/90">Hội thoại</p>
            <div className="min-h-0 flex-1 overflow-hidden">
              <AIChatPanel className="h-full" />
            </div>
          </div>
        </div>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
