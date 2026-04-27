import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, PlayCircle } from "lucide-react";

const benefits = [
  {
    title: "Đơn giản và dễ sử dụng",
    desc: "Thiết kế trực quan, thao tác nhanh chóng cho mọi nhân sự.",
  },
  {
    title: "Tiết kiệm chi phí",
    desc: "Tối ưu vận hành, giảm thất thoát và hạn chế sai sót thủ công.",
  },
  {
    title: "Phù hợp nhiều mô hình",
    desc: "Dùng tốt cho cửa hàng bán lẻ, chuỗi cửa hàng và kho nội bộ.",
  },
];

const suiteCards = [
  {
    title: "Phần mềm quản lý bán hàng",
    points: [
      "Quản lý hàng hóa và tồn kho",
      "Theo dõi doanh thu theo thời gian thực",
      "Báo cáo trực quan, dễ theo dõi",
    ],
    cta: "Xem chi tiết",
  },
  {
    title: "Thanh toán và công nợ",
    points: [
      "Hỗ trợ nhiều hình thức thanh toán",
      "Theo dõi công nợ khách hàng, nhà cung cấp",
      "Đối soát nhanh, giảm sai lệch",
    ],
    cta: "Liên hệ tư vấn",
  },
  {
    title: "Hỗ trợ vận hành cửa hàng",
    points: [
      "Quản lý nhân sự và ca làm việc",
      "Phân quyền theo vai trò",
      "Hỗ trợ nghiệp vụ bán hàng tại quầy",
    ],
    cta: "Tìm hiểu thêm",
  },
];

const onlineSolutions = [
  {
    title: "Đồng bộ với sàn thương mại điện tử",
    desc: "Kết nối đơn hàng đa kênh, đồng bộ tồn kho và trạng thái xử lý nhanh chóng.",
    tint: "from-emerald-50 to-green-100/70",
  },
  {
    title: "Website bán hàng chỉ với 1 lần chạm",
    desc: "Tạo trang bán hàng online nhanh để tiếp cận khách hàng mọi lúc, mọi nơi.",
    tint: "from-blue-50 to-sky-100/70",
  },
  {
    title: "Liên kết bán hàng trên mạng xã hội",
    desc: "Quản lý đơn từ Facebook, chat và bình luận trong một màn hình tập trung.",
    tint: "from-rose-50 to-pink-100/70",
  },
  {
    title: "Giải pháp giao hàng dễ dàng",
    desc: "Kết nối đối tác giao vận, tự động cập nhật trạng thái giao hàng theo đơn.",
    tint: "from-amber-50 to-yellow-100/70",
  },
];

function GradientBadge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-100 to-blue-100 px-4 py-2 text-sm font-semibold text-sky-700">
      {children}
    </span>
  );
}

export default function PreLoginLandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600" />
            <span className="text-lg font-extrabold tracking-tight">ISMS</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex">
            <a href="#features" className="hover:text-blue-600">Giải pháp</a>
            <a href="#suite" className="hover:text-blue-600">Sản phẩm</a>
            <a href="#online" className="hover:text-blue-600">Bán online</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-full border border-blue-200 px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
            >
              Đăng nhập
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Đăng ký
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-r from-slate-100 to-sky-100/70">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-20">
          <div className="flex flex-col justify-center">
            <GradientBadge>Phần mềm quản lý bán hàng</GradientBadge>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
              Phần mềm quản lý bán hàng phổ biến nhất
            </h1>
            <p className="mt-4 max-w-xl text-base text-slate-600">
              Tăng hiệu quả vận hành với quy trình bán hàng, tồn kho, công nợ và báo cáo được đồng bộ trong một nền tảng.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/register"
                className="rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                Dùng thử miễn phí
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-5 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-200"
              >
                Khám phá <PlayCircle className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-8">
              <div>
                <p className="text-3xl font-extrabold text-slate-900">300.000+</p>
                <p className="text-sm text-slate-600">nhà kinh doanh sử dụng</p>
              </div>
              <div>
                <p className="text-3xl font-extrabold text-slate-900">10.000+</p>
                <p className="text-sm text-slate-600">đăng ký mới mỗi tháng</p>
              </div>
            </div>
          </div>
          <div className="relative flex items-center justify-center">
            <div className="h-[430px] w-full rounded-[2rem] bg-gradient-to-br from-sky-200/70 via-slate-100 to-white p-6 shadow-xl">
              <div className="flex h-full w-full items-center justify-center rounded-[1.5rem] border border-white/70 bg-white/50 p-8">
                <div className="h-full w-full rounded-3xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 opacity-90" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-extrabold text-slate-900">
          ISMS giúp bạn quản lý dễ dàng, bán hàng hiệu quả
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {benefits.map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <div className="mx-auto mb-4 h-11 w-11 rounded-full bg-sky-100" />
              <h3 className="text-base font-extrabold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="suite" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-extrabold text-slate-900">
            ISMS - Giải pháp kinh doanh toàn diện
          </h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {suiteCards.map((card) => (
              <article key={card.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
                <div className="mb-4 h-10 w-28 rounded-lg bg-gradient-to-r from-sky-400 to-blue-600" />
                <h3 className="text-lg font-extrabold text-slate-900">{card.title}</h3>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  {card.points.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-6 rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-200"
                >
                  {card.cta}
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="online" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-extrabold text-blue-700">Giải pháp Bán hàng online hiệu quả</h2>
        <div className="mt-10 space-y-4">
          {onlineSolutions.map((solution) => (
            <article
              key={solution.title}
              className={`grid gap-4 rounded-2xl border border-slate-200 bg-gradient-to-r ${solution.tint} p-6 md:grid-cols-[1fr_auto] md:items-center`}
            >
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">{solution.title}</h3>
                <p className="mt-2 text-sm text-slate-700">{solution.desc}</p>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-blue-700 shadow-sm"
                >
                  Xem chi tiết <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="h-28 w-full rounded-xl border border-white/80 bg-white/70 md:w-48" />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
