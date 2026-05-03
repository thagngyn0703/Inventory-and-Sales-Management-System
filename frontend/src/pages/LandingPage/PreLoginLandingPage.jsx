import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardList,
  PlayCircle,
  ShieldCheck,
  UserCog,
  Users2,
} from "lucide-react";

const benefits = [
  {
    title: "Phân quyền rõ ràng theo vai trò",
    desc: "Tách quyền Admin, Quản lý và Nhân viên để vận hành đúng trách nhiệm.",
    icon: UserCog,
  },
  {
    title: "Dữ liệu tập trung theo thời gian thực",
    desc: "Đồng bộ đơn hàng, tồn kho, công nợ và biến động kho trên cùng một nền tảng.",
    icon: BarChart3,
  },
  {
    title: "Hỗ trợ vận hành đầy đủ nghiệp vụ",
    desc: "Xử lý bán hàng, nhập kho, kiểm kê, trả hàng và báo cáo ngay trong hệ thống.",
    icon: ClipboardList,
  },
];

const suiteCards = [
  {
    title: "Bán hàng và hóa đơn",
    points: [
      "Tạo và theo dõi hóa đơn nhanh tại quầy",
      "Quản lý khách hàng và lịch sử giao dịch",
      "Hỗ trợ trả hàng, đối soát và theo dõi doanh thu",
    ],
    cta: "Khám phá module",
  },
  {
    title: "Kho hàng và mua hàng",
    points: [
      "Quản lý phiếu nhập, kiểm kê và điều chỉnh tồn kho",
      "Theo dõi đề xuất nhập hàng từ nhân viên kho",
      "Quản lý nhà cung cấp và nghiệp vụ trả hàng nhà cung cấp",
    ],
    cta: "Xem chức năng",
  },
  {
    title: "Quản trị và điều hành",
    points: [
      "Quản lý nhân sự, phân ca và cấu hình cửa hàng",
      "Theo dõi dòng tiền, công nợ phải thu và phải trả",
      "Tích hợp AI Assistant và kênh hỗ trợ nội bộ",
    ],
    cta: "Tìm hiểu thêm",
  },
];

const onlineSolutions = [
  {
    title: "Dashboard theo vai trò",
    desc: "Mỗi vai trò có giao diện làm việc riêng giúp truy cập đúng nghiệp vụ cần xử lý.",
    tint: "from-emerald-50 to-green-100/70",
    icon: Users2,
  },
  {
    title: "Luồng nghiệp vụ liên thông",
    desc: "Dữ liệu từ bán hàng, kho và công nợ liên kết chặt chẽ để giảm sai lệch vận hành.",
    tint: "from-blue-50 to-sky-100/70",
    icon: Boxes,
  },
  {
    title: "Báo cáo và truy vết thay đổi",
    desc: "Theo dõi lịch sử giá, giao dịch và biến động tồn kho để ra quyết định chính xác hơn.",
    tint: "from-rose-50 to-pink-100/70",
    icon: BarChart3,
  },
  {
    title: "Vận hành an toàn và nhất quán",
    desc: "Thiết lập quyền truy cập và quy trình chuẩn để giảm rủi ro thao tác sai dữ liệu.",
    tint: "from-amber-50 to-yellow-100/70",
    icon: ShieldCheck,
  },
];

const pricingPlans = [
  {
    name: "Gói theo tháng",
    duration: "Chu kỳ 1 tháng",
    price: "100.000đ",
    note: "Phù hợp để bắt đầu nhanh và linh hoạt theo nhu cầu.",
    features: [
      "Đầy đủ chức năng vận hành của hệ thống",
      "Quản lý không giới hạn giao dịch trong tháng",
      "Hỗ trợ kỹ thuật trong quá trình sử dụng",
    ],
    cta: "Chọn gói 1 tháng",
    highlight: false,
  },
  {
    name: "Gói theo năm",
    duration: "Chu kỳ 12 tháng",
    price: "1.100.000đ",
    note: "Tối ưu chi phí cho đội ngũ vận hành lâu dài.",
    features: [
      "Toàn bộ chức năng như gói tháng",
      "Thanh toán một lần cho 12 tháng sử dụng",
      "Ưu tiên hỗ trợ triển khai và vận hành",
    ],
    cta: "Chọn gói 12 tháng",
    highlight: true,
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
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 shadow-sm">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight leading-none">ISMS</p>
              <p className="text-[11px] font-semibold text-slate-500">Store Operations Platform</p>
            </div>
          </div>

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
            <GradientBadge>Nền tảng quản lý cửa hàng ISMS</GradientBadge>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
              Hệ thống quản lý vận hành cửa hàng tập trung
            </h1>
            <p className="mt-4 max-w-xl text-base text-slate-600">
              ISMS giúp đội ngũ quản lý đồng bộ bán hàng, kho, công nợ, nhân sự và hỗ trợ vận hành trên một hệ thống thống nhất.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/register"
                className="rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                Bắt đầu ngay
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-5 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-200"
              >
                Xem tính năng <PlayCircle className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-8">
              <div>
                <p className="text-3xl font-extrabold text-slate-900">3</p>
                <p className="text-sm text-slate-600">vai trò vận hành chính</p>
              </div>
              <div>
                <p className="text-3xl font-extrabold text-slate-900">1</p>
                <p className="text-sm text-slate-600">nền tảng dữ liệu tập trung</p>
              </div>
            </div>
          </div>
          <div className="relative flex items-center justify-center">
            <div className="h-[430px] w-full rounded-[2rem] bg-gradient-to-br from-sky-200/70 via-slate-100 to-white p-6 shadow-xl">
              <div className="flex h-full w-full flex-col justify-between rounded-[1.5rem] border border-white/70 bg-white/80 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
                    <BarChart3 className="h-5 w-5 text-sky-700" />
                    <p className="mt-2 text-xs font-bold text-slate-800">Doanh thu</p>
                    <p className="text-lg font-extrabold text-slate-900">+18%</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                    <Boxes className="h-5 w-5 text-emerald-700" />
                    <p className="mt-2 text-xs font-bold text-slate-800">Tồn kho</p>
                    <p className="text-lg font-extrabold text-slate-900">Ổn định</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Users2 className="h-4 w-4 text-blue-600" />
                    <p className="text-sm font-bold text-slate-800">Vận hành theo vai trò</p>
                  </div>
                  <div className="space-y-2 text-xs text-slate-600">
                    <p className="rounded-lg bg-slate-100 px-3 py-2">Admin: Quản lý toàn hệ thống</p>
                    <p className="rounded-lg bg-slate-100 px-3 py-2">Quản lý: Điều hành cửa hàng và kho</p>
                    <p className="rounded-lg bg-slate-100 px-3 py-2">Nhân viên: Bán hàng và thao tác nghiệp vụ</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white">
                  Dữ liệu tập trung - Quy trình nhất quán - Báo cáo tức thời
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-extrabold text-slate-900">
          ISMS giúp vận hành cửa hàng hiệu quả và minh bạch
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {benefits.map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-sky-100">
                <item.icon className="h-5 w-5 text-sky-700" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="suite" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-extrabold text-slate-900">
            ISMS - Hệ sinh thái nghiệp vụ toàn diện
          </h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {suiteCards.map((card) => (
              <article key={card.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
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
        <h2 className="text-center text-3xl font-extrabold text-blue-700">Năng lực nổi bật của hệ thống ISMS</h2>
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
              <div className="flex h-28 w-full items-center justify-center rounded-xl border border-white/80 bg-white/70 md:w-48">
                <solution.icon className="h-12 w-12 text-blue-600" />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-extrabold text-slate-900">Mua gói dịch vụ ISMS</h2>
          <p className="mt-3 text-center text-sm text-slate-600">
            Chọn gói phù hợp để triển khai hệ thống cho cửa hàng của bạn.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {pricingPlans.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-2xl border p-6 shadow-sm ${
                  plan.highlight
                    ? "border-blue-300 bg-gradient-to-b from-blue-50 to-white"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                {plan.highlight ? (
                  <span className="inline-flex rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                    Khuyến nghị
                  </span>
                ) : null}
                <h3 className="mt-3 text-xl font-extrabold text-slate-900">{plan.name}</h3>
                <p className="mt-1 text-sm font-semibold text-blue-700">{plan.duration}</p>
                <p className="mt-5 text-4xl font-extrabold text-slate-900">{plan.price}</p>
                <p className="mt-3 text-sm text-slate-600">{plan.note}</p>
                <ul className="mt-5 space-y-2 text-sm text-slate-700">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className={`mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-bold transition ${
                    plan.highlight
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  }`}
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
