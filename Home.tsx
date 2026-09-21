import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  CloudRain,
  Home as HomeIcon,
  Loader2,
  LogIn,
  MapPin,
  Megaphone,
  Menu,
  MoreHorizontal,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Siren,
  Users,
  X,
  CheckCircle2,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

const statusMeta: Record<string, { label: string; tone: string; dot: string; text: string }> = {
  safe: { label: "Safe", tone: "bg-[#e2f3eb] text-[#247a5d]", dot: "bg-[#2f9b79]", text: "Safe" },
  needs_assistance: { label: "Needs assistance", tone: "bg-[#fff1d7] text-[#a66912]", dot: "bg-[#e7a33e]", text: "Needs assistance" },
  missing: { label: "Missing / unreachable", tone: "bg-[#fde5e0] text-[#b8493a]", dot: "bg-[#d86655]", text: "Missing / unreachable" },
  hospitalized: { label: "Hospitalized", tone: "bg-[#eee9fb] text-[#6f5aa7]", dot: "bg-[#8a74c7]", text: "Hospitalized" },
  evacuated: { label: "Evacuated", tone: "bg-[#e3edf9] text-[#3f6eab]", dot: "bg-[#5d8dc9]", text: "Evacuated" },
};

type Student = {
  id: number;
  studentCode: string;
  name: string;
  gradeLevel: string;
  className: string;
  teacherName: string;
  status: string;
  location: string;
  guardianPhone: string;
  lastUpdated: number;
};

type EmergencyStatus = "safe" | "needs_assistance" | "missing" | "hospitalized" | "evacuated";

type ClassItem = {
  id: number;
  name: string;
  gradeLevel: string;
  room: string;
  teacherName: string;
  studentCount: number;
  needsAttention: number;
};

type Snapshot = {
  summary: { totalStudents: number; safe: number; needsAssistance: number; missing: number; hospitalized: number; evacuated: number; classesReporting: number; totalClasses: number };
  statusBreakdown: Array<{ label: string; value: number; color: string }>;
  classes: ClassItem[];
  students: Student[];
  announcements: Array<{ id: number; title: string; message: string; severity: string; audience: string; publishedAt: number }>;
  lastUpdatedAt: number;
  source: "database" | "fallback";
  studentsTruncated: boolean;
};

type ClassReport = {
  class: ClassItem | null;
  students: Student[];
  statusBreakdown: Array<{ label: string; value: number; color: string }>;
  generatedAt: number;
};

const formatRelative = (timestamp: number) => {
  const mins = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
};

const formatClock = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const buildGradient = (items: Array<{ value: number; color: string }>) => {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = 0;
  const pieces = items.map(item => {
    const start = cursor;
    cursor += (item.value / total) * 360;
    return `${item.color} ${start}deg ${cursor}deg`;
  });
  return `conic-gradient(${pieces.join(", ")})`;
};

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta[status] ?? statusMeta.safe;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function BoardMenu({ onNavigate, compact = false }: { onNavigate: (item: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const boards = [
    { id: "overview", label: "Response overview" },
    { id: "students", label: "Student records" },
    { id: "classes", label: "Class reports" },
    { id: "attendance", label: "Attendance board" },
    { id: "emergency", label: "Emergency status" },
    { id: "announcements", label: "Announcement center" },
  ];
  return <div className="relative"><button aria-label="Open boards menu" aria-expanded={open} onClick={() => setOpen(value => !value)} className={`${compact ? "grid h-9 w-9" : "grid h-8 w-8"} place-items-center rounded-[9px] text-[#7fab91] transition hover:bg-white/10 hover:text-white`}><MoreHorizontal className="h-4 w-4" /></button>{open && <div className="absolute left-0 top-10 z-50 w-52 rounded-[12px] border border-[#dce7dd] bg-[#fffdf8] p-1.5 shadow-[0_14px_35px_rgba(20,59,50,0.18)]">{boards.map(board => <button key={board.id} onClick={() => { setOpen(false); onNavigate(board.id); }} className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[11px] font-semibold text-[#416b5b] hover:bg-[#edf5ed]">{board.label}<ChevronRight className="ml-auto h-3.5 w-3.5 text-[#9aae9f]" /></button>)}</div>}</div>;
}

function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7d9287]">{eyebrow}</p>}
        <h2 className="font-display text-[19px] font-bold tracking-[-0.03em] text-[#183830]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function SideNav({ active, onNavigate, urgentCount }: { active: string; onNavigate: (item: string) => void; urgentCount: number }) {
  const items = [
    { id: "overview", label: "Overview", icon: HomeIcon },
    { id: "students", label: "Students", icon: Users },
    { id: "classes", label: "Classes", icon: BookOpen },
    { id: "attendance", label: "Attendance", icon: ClipboardCheck },
    { id: "emergency", label: "Emergency status", icon: Siren, badge: urgentCount },
    { id: "announcements", label: "Announcements", icon: Megaphone },
  ];
  return (
    <aside className="hidden min-h-screen w-[238px] shrink-0 flex-col bg-[#173d36] text-white lg:flex">
      <div className="flex h-[84px] items-center gap-3 px-7">
        <div className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#e8aa49] text-[#173d36] shadow-[0_8px_20px_rgba(232,170,73,0.16)]">
          <ShieldCheck className="h-[21px] w-[21px] stroke-[2.5]" />
        </div>
        <div>
          <div className="font-display text-[16px] font-bold tracking-[-0.03em]">Northstar</div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.23em] text-[#9cc5ad]">School resilience</div>
        </div>
        <div className="ml-auto"><BoardMenu onNavigate={onNavigate} /></div>
      </div>
      <div className="mx-6 mb-7 h-px bg-white/10" />
      <div className="px-4">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7fab91]">Command center</p>
        <nav className="space-y-1">
          {items.map(item => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`group flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold transition-all duration-150 ${isActive ? "bg-[#2d6557] text-white shadow-[inset_3px_0_0_#e8aa49]" : "text-[#b3d0bf] hover:bg-white/7 hover:text-white"}`}
              >
                <Icon className={`h-[17px] w-[17px] ${isActive ? "text-[#f3bd61]" : "text-[#7fab91] group-hover:text-[#d7ecdc]"}`} />
                <span className="flex-1">{item.label}</span>
                {item.badge ? <span className="rounded-full bg-[#d86655] px-1.5 py-0.5 text-[10px] font-extrabold text-white">{item.badge}</span> : null}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto px-6 pb-7">
        <div className="rounded-[14px] border border-white/10 bg-[#204b42] p-4">
          <div className="mb-3 flex items-center gap-2 text-[#f3bd61]"><CloudRain className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.16em]">Storm watch</span></div>
          <p className="text-[12px] leading-5 text-[#c4ddd0]">Response protocol is active. Keep class rosters current.</p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-[#8fbd9f]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e8aa49]" />Last synced 2 min ago</div>
        </div>
      </div>
    </aside>
  );
}

function MetricCard({ label, value, sublabel, tone, icon: Icon, onClick }: { label: string; value: string | number; sublabel: string; tone: string; icon: typeof Users; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`group rounded-[15px] border border-[#dce7dd] bg-[#fffdf8] p-4 text-left shadow-[0_8px_28px_rgba(31,67,52,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(31,67,52,0.08)] ${onClick ? "cursor-pointer" : "cursor-default"}`}>
      <div className="mb-3 flex items-start justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7c9286]">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-[9px] ${tone}`}><Icon className="h-[16px] w-[16px]" /></span>
      </div>
      <div className="font-display text-[29px] font-bold leading-none tracking-[-0.05em] text-[#183830]">{value}</div>
      <div className="mt-2 text-[11px] font-medium text-[#84978c]">{sublabel}</div>
    </button>
  );
}

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const { data, isLoading, error, refetch, dataUpdatedAt } = trpc.dashboard.snapshot.useQuery(undefined, { refetchInterval: 10000, staleTime: 5000 });
  const snapshot = data as Snapshot | undefined;
  const [activeNav, setActiveNav] = useState("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementSeverity, setAnnouncementSeverity] = useState<"info" | "warning" | "critical">("warning");
  const [announcementAudience, setAnnouncementAudience] = useState("All families");
  const [showAllStudents, setShowAllStudents] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [statusDraft, setStatusDraft] = useState<EmergencyStatus>("needs_assistance");
  const [locationDraft, setLocationDraft] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [attendanceState, setAttendanceState] = useState<Record<number, "present" | "absent" | "late">>(() => ({}));
  const classReportInput = useMemo(() => ({ classId: selectedClassId ?? 1 }), [selectedClassId]);
  const classReportQuery = trpc.classes.report.useQuery(classReportInput, { enabled: selectedClassId !== null });

  const publishAnnouncement = trpc.announcements.create.useMutation({
    onSuccess: () => {
      toast.success("Announcement published to the response feed");
      setAnnouncementTitle("");
      setAnnouncementMessage("");
      void refetch();
    },
    onError: error => toast.error(error.message),
  });

  const updateStatus = trpc.students.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Emergency status updated");
      setSelectedStudent(null);
      void refetch();
    },
    onError: error => toast.error(error.message),
  });

  const recordAttendance = trpc.attendance.record.useMutation({
    onSuccess: () => toast.success("Attendance saved"),
    onError: error => toast.error(error.message),
  });

  const students = useMemo(() => {
    const list = snapshot?.students ?? [];
    const normalized = search.trim().toLowerCase();
    return list.filter(student => {
      const matchesStatus = statusFilter === "all" || student.status === statusFilter;
      const haystack = `${student.name} ${student.studentCode} ${student.className}`.toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [snapshot?.students, search, statusFilter]);

  const followUpStudents = useMemo(() => {
    const list = students.filter(student => student.status !== "safe");
    return showAllStudents ? list : list.slice(0, 5);
  }, [students, showAllStudents]);

  const totalStatus = snapshot?.summary.totalStudents ?? 0;
  const urgentCount = (snapshot?.summary.needsAssistance ?? 0) + (snapshot?.summary.missing ?? 0);
  const chartStyle = snapshot ? { background: buildGradient(snapshot.statusBreakdown) } : undefined;
  const liveUpdatedAt = dataUpdatedAt || snapshot?.lastUpdatedAt || Date.now();

  const handleAnnouncement = (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      toast("Staff sign-in is required to publish", { action: { label: "Sign in", onClick: () => startLogin() } });
      return;
    }
    publishAnnouncement.mutate({ title: announcementTitle, message: announcementMessage, severity: announcementSeverity, audience: announcementAudience });
  };

  const handleNav = (item: string) => {
    setActiveNav(item);
    setMobileNavOpen(false);
    const target = document.getElementById(item);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const setAttendance = (studentId: number, status: "present" | "absent" | "late") => {
    setAttendanceState(current => ({ ...current, [studentId]: status }));
    if (!user) {
      toast("Attendance marked in this view; staff sign-in is required to persist it", { action: { label: "Sign in", onClick: () => startLogin() } });
      return;
    }
    recordAttendance.mutate({ studentId, status, attendanceDate: new Date().toISOString().slice(0, 10) });
  };

  // Spreadsheet apps run cells that start with = + - @ as formulas. Names and locations are user-entered, so neutralise them.
  const csvCell = (value: unknown) => {
    const text = String(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };

  const exportIncidentReport = () => {
    const rows = [["Student", "Student code", "Class", "Teacher", "Status", "Last seen", "Last seen at"], ...(snapshot?.students ?? []).map(student => [student.name, student.studentCode, student.className, student.teacherName, student.status, student.location, new Date(student.lastUpdated).toISOString()])];
    const csv = rows.map(row => row.map(csvCell).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `northstar-emergency-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("Emergency report downloaded");
  };

  if (isLoading || !snapshot) {
    return <div className="grid min-h-screen place-items-center bg-[#f4f7f2]"><div className="flex items-center gap-3 text-[#3c7464]"><Loader2 className="h-5 w-5 animate-spin" />Loading response center…</div></div>;
  }

  return (
    <div className="min-h-screen bg-[#f4f7f2] text-[#183830]">
      <div className="flex min-h-screen">
        <SideNav active={activeNav} onNavigate={handleNav} urgentCount={urgentCount} />
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#dfe8df] bg-[#f4f7f2]/90 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileNavOpen(open => !open)} aria-expanded={mobileNavOpen} className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#e5eee5] text-[#396d5e] lg:hidden"><Menu className="h-4 w-4" /></button><div className="lg:hidden"><BoardMenu compact onNavigate={handleNav} /></div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-[#799186]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#2f9b79]" />Live status · synced {formatClock(liveUpdatedAt)}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 text-right sm:flex"><div><p className="text-[12px] font-bold text-[#23493e]">{user?.name ?? "Read-only observer"}</p><p className="text-[10px] font-medium text-[#8a9e91]">{user ? `${user.role} access` : "Public status view"}</p></div><div className="grid h-8 w-8 place-items-center rounded-full bg-[#d7e8db] text-[11px] font-extrabold text-[#2e6958]">{user?.name?.slice(0, 1).toUpperCase() ?? "R"}</div></div>
              {user ? <Button variant="ghost" size="sm" onClick={logout} className="text-[#5c7469]">Sign out</Button> : <Button size="sm" onClick={() => startLogin()} className="rounded-full bg-[#1d594c] px-4 text-white hover:bg-[#16463c]"><LogIn className="mr-1.5 h-3.5 w-3.5" />Staff sign in</Button>}
            </div>
          </header>

          {mobileNavOpen && <div className="border-b border-[#dce7dd] bg-[#173d36] px-5 py-3 text-white shadow-lg lg:hidden"><div className="grid grid-cols-2 gap-1">{[{ id: "overview", label: "Overview", icon: HomeIcon }, { id: "students", label: "Students", icon: Users }, { id: "classes", label: "Classes", icon: BookOpen }, { id: "attendance", label: "Attendance", icon: ClipboardCheck }, { id: "emergency", label: "Emergency status", icon: Siren }, { id: "announcements", label: "Announcements", icon: Megaphone }].map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => handleNav(item.id)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold text-[#c9e1d0] hover:bg-white/10"><Icon className="h-4 w-4 text-[#f3bd61]" />{item.label}</button>; })}</div></div>}

          <div className="mx-auto max-w-[1480px] px-5 pb-12 pt-7 sm:px-8 lg:px-10">
            <section id="overview" className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#789086]"><span>Northstar district</span><span className="text-[#b3c1b7]">/</span><span>{new Date().toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}</span><span className="text-[#b3c1b7]">/</span><span>14:32 IST</span></div>
                <h1 className="font-display text-[34px] font-bold leading-[1.02] tracking-[-0.06em] text-[#173d36] sm:text-[42px]">School response center<span className="text-[#e3a547]">.</span></h1>
                <p className="mt-3 max-w-[560px] text-[14px] leading-6 text-[#6f8478]">A clear view of every learner, every classroom, and every action that keeps your community accounted for.</p>
              </div>
              <div className="flex items-center gap-3 rounded-[14px] border border-[#ead9b9] bg-[#fff7e8] px-4 py-3 shadow-[0_7px_22px_rgba(157,113,38,0.05)]"><div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#fbe5b7] text-[#a46c1a]"><Radio className="h-[17px] w-[17px]" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#ad7b30]">Live situation</p><p className="mt-0.5 text-[12px] font-bold text-[#6b522b]">Shelter roll call in progress</p><p className="mt-0.5 text-[10px] font-medium text-[#a47a36]">Auto-refresh every 10 seconds</p></div><span className="ml-2 h-2 w-2 animate-pulse rounded-full bg-[#e7a33e]" /></div>
            </section>

            {error && <div className="mb-5 flex items-center justify-between rounded-[12px] border border-[#f2c6bf] bg-[#fff0ed] px-4 py-3 text-[12px] text-[#9f4437]"><span>Live data is temporarily unavailable. The command center is showing its last resilient snapshot.</span><button onClick={() => refetch()} className="font-bold underline">Retry</button></div>}
            {snapshot.source === "fallback" && <div role="status" className="mb-5 rounded-[12px] border border-[#f0d9a8] bg-[#fff8e6] px-4 py-3 text-[12px] font-semibold text-[#8a5a12]">Showing demonstration data. The live student database is not connected or has no imported roster, so these figures are not real.</div>}
            {snapshot.studentsTruncated && <div role="status" className="mb-5 rounded-[12px] border border-[#f0d9a8] bg-[#fff8e6] px-4 py-3 text-[12px] font-semibold text-[#8a5a12]">The student list is showing the 500 most recently updated students. Summary totals include everyone.</div>}

            <section className="mb-6 rounded-[16px] border border-[#dce7dd] bg-[#fffdf8] p-4 shadow-[0_8px_28px_rgba(31,67,52,0.035)] sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7d9287]">Role-based access</p><h2 className="mt-1 font-display text-[18px] font-bold text-[#183830]">{user ? `${user.role === "admin" ? "Admin command desk" : user.role === "teacher" ? "Teacher duty board" : "Read-only observer"}` : "Choose your staff workspace"}</h2><p className="mt-1 text-[11px] text-[#71867b]">{user?.role === "admin" ? "Manage roster, publish critical announcements, export reports, and review every class." : user?.role === "teacher" ? "Take attendance, update assigned student statuses, and review class readiness." : "Admin and teacher accounts use the secure sign-in flow and receive role-specific controls."}</p></div><div className="flex flex-wrap gap-2">{user?.role === "admin" ? <><Button size="sm" onClick={() => handleNav("announcements")} className="rounded-full bg-[#1d594c] text-[11px] text-white">Publish alert</Button><Button size="sm" variant="outline" onClick={exportIncidentReport} className="rounded-full text-[11px]">Export report</Button></> : user?.role === "teacher" ? <><Button size="sm" onClick={() => handleNav("attendance")} className="rounded-full bg-[#1d594c] text-[11px] text-white">Take attendance</Button><Button size="sm" variant="outline" onClick={() => handleNav("classes")} className="rounded-full text-[11px]">My classes</Button></> : <><Button size="sm" onClick={() => startLogin()} className="rounded-full bg-[#1d594c] text-[11px] text-white"><LogIn className="mr-1.5 h-3.5 w-3.5" />Admin / teacher login</Button><Button size="sm" variant="outline" onClick={() => toast("Your assigned account role controls the workspace shown after sign-in")} className="rounded-full text-[11px]">How access works</Button></>}</div></div></section>

            <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <MetricCard label="Students" value={snapshot.summary.totalStudents} sublabel={`${snapshot.summary.classesReporting} classes reporting`} tone="bg-[#e1efea] text-[#27745d]" icon={Users} onClick={() => handleNav("students")} />
              <MetricCard label="Safe" value={snapshot.summary.safe} sublabel={`${Math.round((snapshot.summary.safe / totalStatus) * 100)}% of school`} tone="bg-[#e1efea] text-[#27745d]" icon={ShieldCheck} />
              <MetricCard label="Need help" value={snapshot.summary.needsAssistance} sublabel="School-wide total" tone="bg-[#fff0d4] text-[#aa701c]" icon={AlertCircle} onClick={() => { setStatusFilter("needs_assistance"); handleNav("students"); }} />
              <MetricCard label="Unreachable" value={snapshot.summary.missing} sublabel="School-wide total" tone="bg-[#fde4df] text-[#bc4f40]" icon={Siren} onClick={() => { setStatusFilter("missing"); handleNav("students"); }} />
            </section>

            <section className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="rounded-[17px] border border-[#dce7dd] bg-[#fffdf8] p-5 shadow-[0_8px_28px_rgba(31,67,52,0.035)] sm:p-6">
                <SectionHeader eyebrow="Current picture" title="Emergency status distribution" action={<button onClick={() => refetch()} className="flex items-center gap-1.5 text-[11px] font-bold text-[#4f8271] hover:text-[#1d594c]"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>} />
                <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
                  <div className="relative grid h-[166px] w-[166px] shrink-0 place-items-center rounded-full" style={chartStyle}><div className="grid h-[106px] w-[106px] place-items-center rounded-full bg-[#fffdf8] text-center"><div><div className="font-display text-[27px] font-bold tracking-[-0.06em] text-[#183830]">{snapshot.summary.totalStudents}</div><div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#8a9e91]">students</div></div></div></div>
                  <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">{snapshot.statusBreakdown.map(item => <div key={item.label} className="flex items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="truncate text-[12px] font-medium text-[#698075]">{item.label}</span></div><span className="text-[13px] font-extrabold text-[#23493e]">{item.value}</span></div>)}</div>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-[#e8eee8] pt-4 text-[11px] text-[#809488]"><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#2f9b79]" />Updated continuously</span><span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#88a496]" />Shelter locations included</span></div>
              </div>
              <div className="rounded-[17px] border border-[#dce7dd] bg-[#173d36] p-5 text-white shadow-[0_8px_28px_rgba(31,67,52,0.1)] sm:p-6">
                <div className="mb-6 flex items-start justify-between"><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9bc4aa]">Response pulse</p><h2 className="font-display text-[19px] font-bold tracking-[-0.03em]">All systems reporting</h2></div><span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white/10 text-[#f2bd63]"><Radio className="h-[17px] w-[17px]" /></span></div>
                <div className="mb-6 flex items-end gap-3"><span className="font-display text-[47px] font-bold leading-none tracking-[-0.07em] text-[#f6c875]">03:42</span><span className="pb-1 text-[11px] font-semibold text-[#a8c9b5]">since last drill<br />check-in</span></div>
                <div className="space-y-3"><div className="flex items-center justify-between text-[11px]"><span className="text-[#b4d3c0]">Classes reporting</span><span className="font-bold text-white">{snapshot.summary.classesReporting}/{snapshot.summary.totalClasses}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#e8aa49]" style={{ width: `${Math.min(100, (snapshot.summary.classesReporting / snapshot.summary.totalClasses) * 100)}%` }} /></div><div className="flex items-center justify-between pt-1 text-[10px] text-[#8fb7a2]"><span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-[#8ed0a9]" />Shelter check-in open</span><span>Updated {formatClock(liveUpdatedAt)}</span></div></div>
              </div>
            </section>

            <section id="students" className="mt-8 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="rounded-[17px] border border-[#dce7dd] bg-[#fffdf8] p-5 shadow-[0_8px_28px_rgba(31,67,52,0.035)] sm:p-6">
                <SectionHeader eyebrow="Priority queue" title="Follow-up queue" action={<button onClick={() => { setStatusFilter("all"); setShowAllStudents(true); }} className="flex items-center gap-1 text-[11px] font-bold text-[#4f8271]">View details <ChevronRight className="h-3.5 w-3.5" /></button>} />
                <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] border border-[#f0dfbd] bg-[#fffaf0] px-3 py-2 text-[10px] font-semibold text-[#8b7856]"><span>Showing {followUpStudents.length} detailed records</span><span className="text-[#c4b08a]">·</span><span><strong className="text-[#a66912]">{snapshot.summary.needsAssistance}</strong> need assistance school-wide</span><span className="text-[#c4b08a]">·</span><span><strong className="text-[#b8493a]">{snapshot.summary.missing}</strong> unreachable school-wide</span></div>
                <div className="mb-4 flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aae9f]" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, ID or class" className="h-10 w-full rounded-[10px] border border-[#dce7dd] bg-[#fbfcf8] pl-9 pr-3 text-[12px] text-[#23493e] outline-none transition focus:border-[#8bb8a2] focus:ring-2 focus:ring-[#bfe0ca]" /></div><div className="relative"><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 appearance-none rounded-[10px] border border-[#dce7dd] bg-[#fbfcf8] py-0 pl-3 pr-8 text-[12px] font-semibold text-[#587468] outline-none"><option value="all">All statuses</option><option value="needs_assistance">Needs assistance</option><option value="missing">Missing / unreachable</option><option value="hospitalized">Hospitalized</option><option value="evacuated">Evacuated</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#89a194]" /></div></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[780px] border-separate border-spacing-0"><thead><tr className="text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#92a49a]"><th className="border-b border-[#e8eee8] pb-3 pl-1">Student</th><th className="border-b border-[#e8eee8] pb-3">Class / teacher</th><th className="border-b border-[#e8eee8] pb-3">Status</th><th className="border-b border-[#e8eee8] pb-3">Last seen</th><th className="border-b border-[#e8eee8] pb-3 text-right">Seen at</th><th className="border-b border-[#e8eee8] pb-3 text-right">Action</th></tr></thead><tbody>{followUpStudents.length ? followUpStudents.map(student => <tr key={student.id} className="group"><td className="border-b border-[#edf2ed] py-3.5 pl-1"><div className="flex items-center gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e8efea] text-[10px] font-extrabold text-[#447461]">{student.name.split(" ").map(part => part[0]).join("").slice(0, 2)}</div><div><p className="text-[12px] font-bold text-[#23493e]">{student.name}</p><p className="mt-0.5 text-[10px] font-medium text-[#98a89e]">{student.studentCode}</p></div></div></td><td className="border-b border-[#edf2ed] py-3.5 text-[11px] font-semibold text-[#648074]"><p>{student.className}</p><p className="mt-0.5 text-[10px] font-medium text-[#94a79b]">{student.teacherName}</p></td><td className="border-b border-[#edf2ed] py-3.5"><StatusBadge status={student.status} /></td><td className="border-b border-[#edf2ed] py-3.5 text-[11px] font-medium text-[#6e8579]"><span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-[#a2b3a7]" />{student.location}</span></td><td className="border-b border-[#edf2ed] py-3.5 text-right text-[10px] font-semibold text-[#95a79c]">{formatRelative(student.lastUpdated)}<br /><span className="text-[9px] font-medium">{new Date(student.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></td><td className="border-b border-[#edf2ed] py-3.5 text-right"><button onClick={() => { setSelectedStudent(student); setStatusDraft((student.status as EmergencyStatus) ?? "needs_assistance"); setLocationDraft(student.location); }} className="rounded-full border border-[#bfd8c5] px-2.5 py-1 text-[10px] font-bold text-[#39735f] transition hover:bg-[#e9f4eb]">Update status</button></td></tr>) : <tr><td colSpan={6} className="py-12 text-center text-[12px] text-[#8aa095]">No students match this view.</td></tr>}</tbody></table></div>
                {showAllStudents && <button onClick={() => setShowAllStudents(false)} className="mt-4 flex items-center gap-1 text-[11px] font-bold text-[#4f8271]">Show less <ChevronDown className="h-3.5 w-3.5 rotate-180" /></button>}
              </div>

              <div id="announcements" className="rounded-[17px] border border-[#dce7dd] bg-[#fffdf8] p-5 shadow-[0_8px_28px_rgba(31,67,52,0.035)] sm:p-6">
                <SectionHeader eyebrow="Broadcast" title="Publish an update" action={<Bell className="h-4 w-4 text-[#8ba196]" />} />
                <form onSubmit={handleAnnouncement} className="space-y-3"><input value={announcementTitle} onChange={event => setAnnouncementTitle(event.target.value)} required placeholder="Announcement title" className="h-10 w-full rounded-[9px] border border-[#dce7dd] bg-[#fbfcf8] px-3 text-[12px] outline-none focus:border-[#8bb8a2] focus:ring-2 focus:ring-[#bfe0ca]" /><textarea value={announcementMessage} onChange={event => setAnnouncementMessage(event.target.value)} required rows={3} placeholder="Share a clear instruction for families or staff…" className="w-full resize-none rounded-[9px] border border-[#dce7dd] bg-[#fbfcf8] px-3 py-2.5 text-[12px] leading-5 outline-none focus:border-[#8bb8a2] focus:ring-2 focus:ring-[#bfe0ca]" /><div className="grid grid-cols-2 gap-2"><select value={announcementSeverity} onChange={event => setAnnouncementSeverity(event.target.value as "info" | "warning" | "critical")} className="h-10 rounded-[9px] border border-[#dce7dd] bg-[#fbfcf8] px-2 text-[11px] font-semibold text-[#587468] outline-none"><option value="info">Info</option><option value="warning">Action needed</option><option value="critical">Critical</option></select><select value={announcementAudience} onChange={event => setAnnouncementAudience(event.target.value)} className="h-10 rounded-[9px] border border-[#dce7dd] bg-[#fbfcf8] px-2 text-[11px] font-semibold text-[#587468] outline-none"><option>All families</option><option>All teachers</option><option>Grade 5–8 families</option><option>Class leaders</option></select></div><Button type="submit" disabled={publishAnnouncement.isPending} className="h-10 w-full rounded-[9px] bg-[#1d594c] text-[12px] font-bold text-white hover:bg-[#16463c]">{publishAnnouncement.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}{user ? "Publish announcement" : "Sign in to publish"}</Button></form>
                <div className="mt-5 border-t border-[#e8eee8] pt-4"><div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#81968a]">Recent broadcasts</p><span className="text-[10px] font-semibold text-[#9aaba1]">{snapshot.announcements.length} active</span></div><div className="space-y-3">{snapshot.announcements.slice(0, 3).map(item => <div key={item.id} className="flex gap-2.5"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.severity === "critical" ? "bg-[#d86655]" : item.severity === "warning" ? "bg-[#e7a33e]" : "bg-[#5d8dc9]"}`} /><div className="min-w-0"><p className="truncate text-[11px] font-bold text-[#375f52]">{item.title}</p><p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[#83958b]">{item.message}</p><p className="mt-1 text-[9px] font-semibold text-[#a4b2a9]">{item.audience} · {formatClock(item.publishedAt)}</p></div></div>)}</div></div>
              </div>
            </section>

            <section id="attendance" className="mt-8 rounded-[17px] border border-[#dce7dd] bg-[#fffdf8] p-5 shadow-[0_8px_28px_rgba(31,67,52,0.035)] sm:p-6">
              <SectionHeader eyebrow="Daily roll call" title="Attendance check-in" action={<span className="text-[11px] font-semibold text-[#8a9c91]">Tap a status to save locally</span>} />
              <div className="overflow-x-auto"><table className="w-full min-w-[650px] border-separate border-spacing-0"><thead><tr className="text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#92a49a]"><th className="border-b border-[#e8eee8] pb-3 pl-1">Student</th><th className="border-b border-[#e8eee8] pb-3">Class</th><th className="border-b border-[#e8eee8] pb-3">Present</th><th className="border-b border-[#e8eee8] pb-3">Absent</th><th className="border-b border-[#e8eee8] pb-3">Late</th><th className="border-b border-[#e8eee8] pb-3 text-right">Current</th></tr></thead><tbody>{snapshot.students.slice(0, 6).map(student => { const current = attendanceState[student.id]; return <tr key={student.id}><td className="border-b border-[#edf2ed] py-3 pl-1"><div className="flex items-center gap-2.5"><div className="grid h-7 w-7 place-items-center rounded-full bg-[#e8efea] text-[9px] font-extrabold text-[#447461]">{student.name.split(" ").map(part => part[0]).join("").slice(0, 2)}</div><span className="text-[12px] font-bold text-[#315a4c]">{student.name}</span></div></td><td className="border-b border-[#edf2ed] py-3 text-[11px] font-semibold text-[#698075]">{student.className}</td>{(["present", "absent", "late"] as const).map(status => <td key={status} className="border-b border-[#edf2ed] py-3"><button onClick={() => setAttendance(student.id, status)} className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${current === status ? status === "present" ? "bg-[#dff1e7] text-[#247a5d]" : status === "absent" ? "bg-[#fde5e0] text-[#b8493a]" : "bg-[#fff1d7] text-[#a66912]" : "border border-[#dce7dd] text-[#8da097] hover:bg-[#edf3ed]"}`}>{status === "present" ? "Present" : status === "absent" ? "Absent" : "Late"}</button></td>)}<td className="border-b border-[#edf2ed] py-3 text-right">{current ? <span className="inline-flex items-center gap-1 text-[10px] font-bold capitalize text-[#5d796d]"><CheckCircle2 className="h-3.5 w-3.5 text-[#2f9b79]" />{current}</span> : <span className="text-[10px] font-semibold text-[#a2b1a8]">Not marked</span>}</td></tr>; })}</tbody></table></div>
            </section>

            <section id="emergency" className="mt-8 rounded-[17px] border border-[#ead9b9] bg-[#fffaf0] p-5 shadow-[0_8px_28px_rgba(157,113,38,0.04)] sm:p-6">
              <SectionHeader eyebrow="Operational controls" title="Emergency status overview" action={<span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#a47a36]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e7a33e]" />Live monitoring</span>} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{snapshot.statusBreakdown.map(item => { const key = item.label === "Safe" ? "all" : item.label === "Needs assistance" ? "needs_assistance" : item.label === "Missing / unreachable" ? "missing" : item.label === "Hospitalized" ? "hospitalized" : "evacuated"; return <button key={item.label} onClick={() => { if (key !== "all") setStatusFilter(key); else setStatusFilter("all"); handleNav("students"); }} className="rounded-[12px] border border-[#f0dfbd] bg-[#fffdf8] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#d4b77d]"><div className="mb-2 flex items-center justify-between"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} /><span className="font-display text-[24px] font-bold tracking-[-0.05em] text-[#4a594f]">{item.value}</span></div><p className="text-[11px] font-bold text-[#6d7d71]">{item.label}</p><p className="mt-1 text-[10px] font-medium text-[#a09175]">View matching students →</p></button>; })}</div>
            </section>

            <section id="classes" className="mt-8 rounded-[17px] border border-[#dce7dd] bg-[#fffdf8] p-5 shadow-[0_8px_28px_rgba(31,67,52,0.035)] sm:p-6">
              <SectionHeader eyebrow="Class readiness" title="Roster coverage by classroom" action={<button onClick={() => { handleNav("classes"); setSelectedClassId(snapshot.classes[0]?.id ?? null); }} className="flex items-center gap-1 text-[11px] font-bold text-[#4f8271]">Open class reports <ChevronRight className="h-3.5 w-3.5" /></button>} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{snapshot.classes.map(classItem => { const ready = Math.max(0, classItem.studentCount - classItem.needsAttention); const percent = classItem.studentCount ? Math.round((ready / classItem.studentCount) * 100) : 0; return <button type="button" key={classItem.id} onClick={() => setSelectedClassId(classItem.id)} className="rounded-[12px] border border-[#e5ede5] bg-[#fbfcf8] p-3.5 text-left transition hover:-translate-y-0.5 hover:border-[#b9d3c2] hover:shadow-[0_8px_20px_rgba(31,67,52,0.07)]"><div className="mb-3 flex items-start justify-between gap-2"><div><p className="text-[12px] font-extrabold text-[#2a5649]">{classItem.name}</p><p className="mt-1 text-[10px] font-medium text-[#8da097]">{classItem.room}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${percent >= 90 ? "bg-[#e2f3eb] text-[#247a5d]" : "bg-[#fff1d7] text-[#a66912]"}`}>{percent}%</span></div><div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[#e7eee7]"><div className={`h-full rounded-full ${percent >= 90 ? "bg-[#4aa987]" : "bg-[#e7a33e]"}`} style={{ width: `${percent}%` }} /></div><div className="flex justify-between text-[10px] font-semibold text-[#8a9c91]"><span>{ready}/{classItem.studentCount} accounted</span><span>{classItem.teacherName}</span></div></button> })}</div>
            </section>

            {selectedClassId !== null && classReportQuery.data && <div className="fixed inset-0 z-40 flex justify-end bg-[#143b32]/35 backdrop-blur-[2px]"><div className="h-full w-full max-w-[500px] overflow-y-auto border-l border-[#dce7dd] bg-[#fffdf8] p-5 shadow-[-20px_0_70px_rgba(20,59,50,0.18)] sm:p-7"><div className="mb-6 flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#7b9386]">Class-wise emergency report</p><h2 className="mt-1 font-display text-[25px] font-bold tracking-[-0.04em] text-[#183830]">{classReportQuery.data.class?.name}</h2><p className="mt-1 text-[11px] text-[#82968b]">{classReportQuery.data.class?.room} · {classReportQuery.data.class?.teacherName}</p></div><button onClick={() => setSelectedClassId(null)} className="grid h-8 w-8 place-items-center rounded-full bg-[#edf3ed] text-[#6e887b] hover:bg-[#e2ece3]"><X className="h-4 w-4" /></button></div><div className="mb-6 grid grid-cols-2 gap-3"><div className="rounded-[12px] bg-[#eaf4ec] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6f8c7d]">Roster</p><p className="mt-1 font-display text-[26px] font-bold text-[#247a5d]">{classReportQuery.data.students.length}</p><p className="text-[10px] font-medium text-[#799287]">students tracked</p></div><div className="rounded-[12px] bg-[#fff1d7] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a762f]">Attention</p><p className="mt-1 font-display text-[26px] font-bold text-[#a66912]">{classReportQuery.data.students.filter(student => student.status !== "safe").length}</p><p className="text-[10px] font-medium text-[#9a825a]">need follow-up</p></div></div><SectionHeader eyebrow="Status mix" title="Emergency distribution" /><div className="mb-7 space-y-3">{classReportQuery.data.statusBreakdown.map(item => <div key={item.label}><div className="mb-1.5 flex items-center justify-between text-[11px]"><span className="flex items-center gap-2 font-semibold text-[#5e796d]"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span><span className="font-extrabold text-[#294f43]">{item.value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#edf2ed]"><div className="h-full rounded-full" style={{ width: `${classReportQuery.data.students.length ? (item.value / classReportQuery.data.students.length) * 100 : 0}%`, backgroundColor: item.color }} /></div></div>)}</div><SectionHeader eyebrow="Student detail" title="Roster follow-up" /><div className="space-y-2">{classReportQuery.data.students.map(student => <div key={student.id} className="flex items-center justify-between gap-3 rounded-[11px] border border-[#e5ede5] bg-[#fbfcf8] p-3"><div className="min-w-0"><p className="truncate text-[12px] font-bold text-[#315a4c]">{student.name}</p><p className="mt-0.5 truncate text-[10px] text-[#8a9c91]">{student.location} · {formatRelative(student.lastUpdated)}</p></div><StatusBadge status={student.status} /></div>)}</div><p className="mt-6 text-[10px] font-medium text-[#94a59b]">Report generated {formatClock(classReportQuery.data.generatedAt)} · updates with the live dashboard refresh.</p></div></div>}
            {selectedStudent && <div className="fixed inset-0 z-40 grid place-items-center bg-[#143b32]/35 px-4 backdrop-blur-[2px]"><div className="w-full max-w-[430px] rounded-[18px] border border-[#dce7dd] bg-[#fffdf8] p-5 shadow-[0_24px_80px_rgba(20,59,50,0.25)]"><div className="mb-5 flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#7b9386]">Emergency status</p><h2 className="mt-1 font-display text-[22px] font-bold tracking-[-0.04em] text-[#183830]">Update {selectedStudent.name}</h2><p className="mt-1 text-[11px] text-[#82968b]">{selectedStudent.studentCode} · {selectedStudent.className}</p></div><button onClick={() => setSelectedStudent(null)} className="grid h-8 w-8 place-items-center rounded-full bg-[#edf3ed] text-[#6e887b] hover:bg-[#e2ece3]"><X className="h-4 w-4" /></button></div><div className="space-y-3"><label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#80968a]">New status</span><select value={statusDraft} onChange={event => setStatusDraft(event.target.value as EmergencyStatus)} className="h-11 w-full rounded-[10px] border border-[#dce7dd] bg-[#fbfcf8] px-3 text-[12px] font-semibold text-[#355f51] outline-none focus:border-[#8bb8a2] focus:ring-2 focus:ring-[#bfe0ca]"><option value="safe">Safe</option><option value="needs_assistance">Needs assistance</option><option value="missing">Missing / unreachable</option><option value="hospitalized">Hospitalized</option><option value="evacuated">Evacuated</option></select></label><label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#80968a]">Current location</span><input value={locationDraft} onChange={event => setLocationDraft(event.target.value)} placeholder="e.g. North shelter" className="h-11 w-full rounded-[10px] border border-[#dce7dd] bg-[#fbfcf8] px-3 text-[12px] outline-none focus:border-[#8bb8a2] focus:ring-2 focus:ring-[#bfe0ca]" /></label></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setSelectedStudent(null)} className="rounded-[9px] text-[12px]">Cancel</Button><Button disabled={updateStatus.isPending} onClick={() => { if (!user) { toast("Staff sign-in is required to update status", { action: { label: "Sign in", onClick: () => startLogin() } }); return; } updateStatus.mutate({ studentId: selectedStudent.id, status: statusDraft, location: locationDraft }); }} className="rounded-[9px] bg-[#1d594c] text-[12px] text-white hover:bg-[#16463c]">{updateStatus.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Save status</Button></div></div></div>}

            <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-[#dce7dd] pt-5 text-[10px] font-medium text-[#8b9d92] sm:flex-row"><span>Northstar School Resilience Hub · Built for calm, accountable response.</span><span className="flex items-center gap-3"><span className="flex items-center gap-1"><CircleHelp className="h-3 w-3" />Emergency help desk: ext. 104</span><span className="flex items-center gap-1 text-[#4e826f]"><span className="h-1.5 w-1.5 rounded-full bg-[#2f9b79]" />API operational</span></span></footer>
          </div>
        </main>
      </div>
    </div>
  );
}
