import React, { useState, useEffect, useRef } from "react";
import {
  Target,
  Zap,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  UserPlus,
  Flame,
  RefreshCw,
  Calendar,
  Briefcase,
  User,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// --- CONFIGURAÇÕES DE METAS ---
const MILESTONES = [
  { percent: 60, target: 42, label: "Meta Mínima" }, // 21 cada
  { percent: 70, target: 50, label: "Acelerando" }, // 25 cada
  { percent: 80, target: 58, label: "Voo Cruzeiro" }, // 28 cada
  { percent: 90, target: 68, label: "Elite" }, // 32 cada
  { percent: 100, target: 76, label: "Supernova" }, // 35 cada
];

// --- DICAS SPICED ---
const SPICED_TIPS = [
  { letter: "S", title: "Situação", text: "Qual o contexto atual da empresa? Fatos, números e cenário." },
  { letter: "P", title: "Problema (Pain)", text: "Qual a dor principal que os impede de crescer ou gera custo?" },
  { letter: "I", title: "Impacto", text: "Como esse problema afeta a receita, tempo ou moral da equipe?" },
  { letter: "C", title: "Evento Crítico", text: "Por que eles precisam resolver isso AGORA? Qual o prazo?" },
  { letter: "D", title: "Decisão", text: "Quem assina o cheque? Como é o processo de compra deles?" },
];

// =====================
// PERSISTÊNCIA (por mês)
// =====================
const STORAGE_KEY = "sdrquest:v1";

function monthKeyNow() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeText(s) {
  return (s || "").toString().trim().replace(/\s+/g, " ");
}

function loadStateAll() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      currentMonth: monthKeyNow(),
      months: {},
    };
  }

  const parsed = safeJsonParse(raw);
  // Migração: se era o estado antigo (juanScore, etc), transforma em months
  if (parsed && typeof parsed === "object" && !parsed.months) {
    const mk = monthKeyNow();
    return {
      currentMonth: mk,
      months: {
        [mk]: {
          juanScore: parsed.juanScore ?? 0,
          heloisaScore: parsed.heloisaScore ?? 0,
          meetingsList: parsed.meetingsList ?? [],
          leads: parsed.leads ?? [],
          celebrated: parsed.celebrated ?? { team: [], juan: [], heloisa: [] },
        },
      },
    };
  }

  if (parsed && typeof parsed === "object") {
    return {
      currentMonth: parsed.currentMonth || monthKeyNow(),
      months: parsed.months || {},
    };
  }

  return {
    currentMonth: monthKeyNow(),
    months: {},
  };
}

function saveStateAll(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save state:", e);
  }
}

export default function SdrQuest() {
  // mês atual
  const currentMonthKey = monthKeyNow();

  // carrega tudo
  const savedAllRef = useRef(loadStateAll());

  // garante que o mês atual existe
  if (!savedAllRef.current.months[currentMonthKey]) {
    savedAllRef.current.months[currentMonthKey] = {
      juanScore: 0,
      heloisaScore: 0,
      meetingsList: [],
      leads: [],
      celebrated: { team: [], juan: [], heloisa: [] },
    };
  }

  // dados do mês atual
  const initialMonthData = savedAllRef.current.months[currentMonthKey];

  // Estados dos Jogadores
  const [juanScore, setJuanScore] = useState(initialMonthData.juanScore ?? 0);
  const [heloisaScore, setHeloisaScore] = useState(initialMonthData.heloisaScore ?? 0);

  // Estado de Agendamentos
  const [schedulingPlayer, setSchedulingPlayer] = useState(null);
  const [meetingForm, setMeetingForm] = useState({ date: "", opportunity: "", ae: "Jânio" });
  const [meetingsList, setMeetingsList] = useState(initialMonthData.meetingsList ?? []);
  const [isMeetingsFeedOpen, setIsMeetingsFeedOpen] = useState(true);

  // Estados do Jogo
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationTitle, setCelebrationTitle] = useState("META ATINGIDA!");
  const [celebrationSubtitle, setCelebrationSubtitle] = useState("Excelente trabalho equipe!");
  const [milestoneReached, setMilestoneReached] = useState(null);

  // Estado dos No-Shows
  const [leads, setLeads] = useState(initialMonthData.leads ?? []);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadSdr, setNewLeadSdr] = useState("juan");

  // Estado das Dicas
  const [currentTip, setCurrentTip] = useState(0);

  // controle de celebrações (pra não disparar toda hora)
  const [celebrated, setCelebrated] = useState(
    initialMonthData.celebrated ?? { team: [], juan: [], heloisa: [] }
  );

  // =====================
  // HISTÓRICO (meses antigos)
  // =====================
  const monthsKeys = Object.keys(savedAllRef.current.months || {});
  const historyMonths = monthsKeys.filter((k) => k !== currentMonthKey).sort().reverse();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySelected, setHistorySelected] = useState(historyMonths[0] || "");

  useEffect(() => {
    if (!historySelected && historyMonths.length) setHistorySelected(historyMonths[0]);
  }, [historyMonths, historySelected]);

  const historyData = historySelected ? savedAllRef.current.months[historySelected] : null;

  // =====================
  // LOG PARA SHEETS
  // =====================
  const monthKeyForSheets = currentMonthKey;

  const logEvent = async (payload) => {
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.warn("logEvent failed:", res.status, data);
      }
    } catch (e) {
      console.warn("logEvent error:", e);
    }
  };

  // =====================
  // SALVAR ESTADO DO MÊS
  // =====================
  useEffect(() => {
    // atualiza o mês atual no ref
    savedAllRef.current.months[currentMonthKey] = {
      juanScore,
      heloisaScore,
      meetingsList,
      leads,
      celebrated,
    };
    savedAllRef.current.currentMonth = currentMonthKey;

    saveStateAll(savedAllRef.current);
  }, [juanScore, heloisaScore, meetingsList, leads, celebrated, currentMonthKey]);

  // =====================
  // Cálculos de Progresso
  // =====================
  const totalScore = juanScore + heloisaScore;

  const currentMilestone = [...MILESTONES].reverse().find((m) => totalScore >= m.target);
  const nextMilestone =
    MILESTONES.find((m) => totalScore < m.target) || MILESTONES[MILESTONES.length - 1];

  const overallProgress = Math.min(100, (totalScore / MILESTONES[MILESTONES.length - 1].target) * 100);

  // metas individuais (metade das metas da equipe)
  const INDIVIDUAL_MILESTONES = MILESTONES.map((m) => ({
    target: Math.ceil(m.target / 2),
    label: m.label,
    percent: m.percent,
  }));

  // =====================
  // Efeito de Rotação das Dicas
  // =====================
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % SPICED_TIPS.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // =====================
  // Monitorar alcance de metas para disparar fogos (Equipe + Individual)
  // =====================
  useEffect(() => {
    // TEAM
    if (currentMilestone && currentMilestone.target > 0 && !celebrated.team.includes(currentMilestone.target)) {
      setCelebrated((prev) => ({ ...prev, team: [...prev.team, currentMilestone.target] }));
      setMilestoneReached(currentMilestone);

      setCelebrationTitle("META DE EQUIPE!");
      setCelebrationSubtitle(`${currentMilestone.percent}% • ${currentMilestone.label}`);
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 5000);
    }

    // JUAN
    const juanMilestone = [...INDIVIDUAL_MILESTONES].reverse().find((m) => juanScore >= m.target);
    if (juanMilestone && !celebrated.juan.includes(juanMilestone.target)) {
      setCelebrated((prev) => ({ ...prev, juan: [...prev.juan, juanMilestone.target] }));

      setCelebrationTitle("META INDIVIDUAL!");
      setCelebrationSubtitle(`Juan atingiu ${juanMilestone.target} reuniões (${juanMilestone.label})`);
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 5000);
    }

    // HELOÍSA
    const helMilestone = [...INDIVIDUAL_MILESTONES].reverse().find((m) => heloisaScore >= m.target);
    if (helMilestone && !celebrated.heloisa.includes(helMilestone.target)) {
      setCelebrated((prev) => ({ ...prev, heloisa: [...prev.heloisa, helMilestone.target] }));

      setCelebrationTitle("META INDIVIDUAL!");
      setCelebrationSubtitle(`Heloísa atingiu ${helMilestone.target} reuniões (${helMilestone.label})`);
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 5000);
    }
  }, [currentMilestone?.target, juanScore, heloisaScore, celebrated, INDIVIDUAL_MILESTONES]);

  // =====================
  // FUNÇÕES DE AÇÃO
  // =====================
  const handleScheduleSubmit = (e) => {
    e.preventDefault();

    const opp = normalizeText(meetingForm.opportunity);
    if (!meetingForm.date || !opp) return;

    const newMeeting = { ...meetingForm, opportunity: opp, sdr: schedulingPlayer, id: Date.now() };

    // ✅ AGORA REGISTRA NO SHEETS (criado)
    logEvent({
      tipo: "reuniao",
      status: "",
      meetingId: String(newMeeting.id),
      sdr: newMeeting.sdr,
      ae: newMeeting.ae,
      oportunidade: newMeeting.opportunity,
      dataReuniao: newMeeting.date,
      noShowCount: "",
      monthKey: monthKeyForSheets,
      observacao: "criado",
    });

    // adiciona no topo
    setMeetingsList((prev) => [newMeeting, ...prev]);

    // Pontua
    if (schedulingPlayer === "juan") setJuanScore((s) => s + 1);
    if (schedulingPlayer === "heloisa") setHeloisaScore((s) => s + 1);

    // Reseta form
    setSchedulingPlayer(null);
    setMeetingForm({ date: "", opportunity: "", ae: "Jânio" });
  };

  // remove um agendamento específico (X no feed)
  const deleteMeetingById = (id) => {
    setMeetingsList((prev) => {
      const index = prev.findIndex((m) => m.id === id);
      if (index === -1) return prev;

      const removed = prev[index];

      if (removed.sdr === "juan") setJuanScore((s) => Math.max(0, s - 1));
      if (removed.sdr === "heloisa") setHeloisaScore((s) => Math.max(0, s - 1));

      // ✅ marca deletado no Sheets
      logEvent({
        tipo: "reuniao",
        status: "[deletado]",
        meetingId: String(removed.id),
        sdr: removed.sdr,
        ae: removed.ae,
        oportunidade: removed.opportunity,
        dataReuniao: removed.date,
        noShowCount: "",
        monthKey: monthKeyForSheets,
        observacao: "removido no feed (X)",
      });

      const newList = [...prev];
      newList.splice(index, 1);
      return newList;
    });
  };

  // -1 (remove o mais recente do SDR)
  const removeMeeting = (player) => {
    if (player === "juan" && juanScore > 0) {
      setJuanScore((s) => Math.max(0, s - 1));
      setMeetingsList((prev) => {
        const index = prev.findIndex((m) => m.sdr === "juan");
        if (index !== -1) {
          const removed = prev[index];

          // log no Sheets (deletado)
          logEvent({
            tipo: "reuniao",
            status: "[deletado]",
            meetingId: String(removed.id),
            sdr: removed.sdr,
            ae: removed.ae,
            oportunidade: removed.opportunity,
            dataReuniao: removed.date,
            noShowCount: "",
            monthKey: monthKeyForSheets,
            observacao: "clicou -1",
          });

          const newList = [...prev];
          newList.splice(index, 1);
          return newList;
        }
        return prev;
      });
    }

    if (player === "heloisa" && heloisaScore > 0) {
      setHeloisaScore((s) => Math.max(0, s - 1));
      setMeetingsList((prev) => {
        const index = prev.findIndex((m) => m.sdr === "heloisa");
        if (index !== -1) {
          const removed = prev[index];

          // log no Sheets (deletado)
          logEvent({
            tipo: "reuniao",
            status: "[deletado]",
            meetingId: String(removed.id),
            sdr: removed.sdr,
            ae: removed.ae,
            oportunidade: removed.opportunity,
            dataReuniao: removed.date,
            noShowCount: "",
            monthKey: monthKeyForSheets,
            observacao: "clicou -1",
          });

          const newList = [...prev];
          newList.splice(index, 1);
          return newList;
        }
        return prev;
      });
    }
  };

  const handleAddNoShow = (e) => {
    e.preventDefault();
    const company = normalizeText(newLeadName);
    if (!company) return;

    const existingLeadIndex = leads.findIndex(
      (l) => normalizeText(l.name).toLowerCase() === company.toLowerCase() && l.sdr === newLeadSdr
    );

    if (existingLeadIndex >= 0) {
      const updatedLeads = [...leads];
      updatedLeads[existingLeadIndex].noShows += 1;
      const newCount = updatedLeads[existingLeadIndex].noShows;

      // ✅ no Sheets: atualiza NoShowCount (não empilha)
      logEvent({
        tipo: "no-show",
        status: "", // status vazio, NoShowCount mostra 1/2/3
        meetingId: "",
        sdr: updatedLeads[existingLeadIndex].sdr,
        ae: "",
        oportunidade: updatedLeads[existingLeadIndex].name,
        dataReuniao: "",
        noShowCount: newCount,
        monthKey: monthKeyForSheets,
        observacao: `no-show ${newCount}`,
      });

      // Regra do 3º no-show: penaliza o SDR responsável e remove o agendamento
      if (updatedLeads[existingLeadIndex].noShows === 3) {
        const penalizedSdr = updatedLeads[existingLeadIndex].sdr;
        const leadName = updatedLeads[existingLeadIndex].name;

        if (penalizedSdr === "juan") setJuanScore((s) => Math.max(0, s - 1));
        else setHeloisaScore((s) => Math.max(0, s - 1));

        setMeetingsList((prev) => {
          let index = prev.findIndex(
            (m) =>
              m.sdr === penalizedSdr &&
              normalizeText(m.opportunity).toLowerCase() === normalizeText(leadName).toLowerCase()
          );

          if (index === -1) index = prev.findIndex((m) => m.sdr === penalizedSdr);

          if (index !== -1) {
            const removed = prev[index];

            // (opcional) marca deletado por penalidade no Sheets
            logEvent({
              tipo: "reuniao",
              status: "[deletado]",
              meetingId: String(removed.id),
              sdr: removed.sdr,
              ae: removed.ae,
              oportunidade: removed.opportunity,
              dataReuniao: removed.date,
              noShowCount: "",
              monthKey: monthKeyForSheets,
              observacao: "penalidade 3º no-show (removeu 1)",
            });

            const newList = [...prev];
            newList.splice(index, 1);
            return newList;
          }
          return prev;
        });
      }

      setLeads(updatedLeads);
    } else {
      const newLead = { id: Date.now(), name: company, sdr: newLeadSdr, noShows: 1 };

      // ✅ no Sheets: cria/atualiza NoShowCount=1
      logEvent({
        tipo: "no-show",
        status: "",
        meetingId: "",
        sdr: newLead.sdr,
        ae: "",
        oportunidade: newLead.name,
        dataReuniao: "",
        noShowCount: 1,
        monthKey: monthKeyForSheets,
        observacao: "no-show 1",
      });

      setLeads([newLead, ...leads]);
    }

    setNewLeadName("");
  };

  const removeLead = (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
  };

  // =====================
  // RENDER
  // =====================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-8 overflow-hidden relative selection:bg-cyan-500/30">
      {/* BACKGROUND EFFECTS */}
      <style>
        {`
          @keyframes blob {
            0% { transform: translate(0px, 0px) scale(1); }
            33% { transform: translate(40px, -40px) scale(1.1); }
            66% { transform: translate(-20px, 20px) scale(0.9); }
            100% { transform: translate(0px, 0px) scale(1); }
          }
          .animate-blob {
            animation: blob 15s infinite alternate ease-in-out;
          }
          .animation-delay-4000 {
            animation-delay: 4s;
          }
        `}
      </style>
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/20 rounded-full blur-[120px] pointer-events-none animate-blob" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none animate-blob animation-delay-4000" />

      {/* FIREWORKS CANVAS (Condicional) */}
      {celebrating && <FireworksCanvas title={celebrationTitle} subtitle={celebrationSubtitle} />}

      {/* HEADER */}
      <header className="relative z-10 flex flex-col md:flex-row justify-between items-center mb-8 gap-6">
        <div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 flex items-center gap-3">
            <Zap className="text-cyan-400 w-8 h-8" />
            SDR QUEST
          </h1>
          <div className="flex flex-col w-fit">
            <p className="text-slate-400 text-sm mt-1 tracking-widest uppercase">Operação Máquina de Vendas</p>
            <p className="text-slate-500 text-[10px] tracking-widest uppercase text-right mt-0.5 font-bold">
              Powered by Vittel
            </p>
          </div>
        </div>

        {/* OVERALL PROGRESS */}
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 p-4 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.15)] w-full md:w-1/2">
          <div className="flex justify-between items-end mb-2">
            <div>
              <span className="text-2xl font-bold text-white">{totalScore}</span>
              <span className="text-slate-400 text-sm ml-2">
                / {MILESTONES[MILESTONES.length - 1].target} Reuniões Totais
              </span>
            </div>
            <div className="text-right">
              <span className="text-cyan-400 font-mono font-bold text-xl">{currentMilestone ? currentMilestone.percent : 0}%</span>
            </div>
          </div>

          <div className="h-3 bg-slate-800 rounded-full overflow-hidden relative">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(6,182,212,0.8)]"
              style={{ width: `${overallProgress}%` }}
            />
          </div>

          <div className="flex justify-between mt-2 text-xs font-mono text-slate-500">
            {MILESTONES.map((m, i) => (
              <div key={i} className={`flex flex-col items-center ${totalScore >= m.target ? "text-cyan-400" : ""}`}>
                <div
                  className={`w-1 h-1 rounded-full mb-1 ${
                    totalScore >= m.target ? "bg-cyan-400 shadow-[0_0_5px_#22d3ee]" : "bg-slate-700"
                  }`}
                />
                {m.percent}%
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* MAIN GRID */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PLAYER 1: JUAN */}
        <PlayerCard
          name="Juan"
          score={juanScore}
          target={nextMilestone.target / 2}
          onAdd={() => setSchedulingPlayer("juan")}
          onRemove={() => removeMeeting("juan")}
          color="cyan"
        />

        {/* SPICED & CENTRAL INFO */}
        <div className="flex flex-col gap-6">
          {/* SPICED WIDGET */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl transition-all group-hover:bg-purple-500/20" />
            <h3 className="text-slate-400 font-bold tracking-widest text-xs mb-4 flex items-center gap-2 uppercase">
              <Flame className="w-4 h-4 text-orange-500" />
              Framework SPICED
            </h3>

            <div className="min-h-[120px] flex flex-col justify-center transition-all duration-500">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl font-black text-purple-400 font-mono">{SPICED_TIPS[currentTip].letter}</span>
                <span className="text-xl font-bold text-white">{SPICED_TIPS[currentTip].title}</span>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">{SPICED_TIPS[currentTip].text}</p>
            </div>

            <div className="flex gap-1 mt-4">
              {SPICED_TIPS.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1 flex-1 rounded-full transition-all duration-500 ${idx === currentTip ? "bg-purple-500" : "bg-slate-800"}`}
                />
              ))}
            </div>
          </div>

          {/* NEXT MILESTONE */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm text-center">
            <Target className="w-8 h-8 text-cyan-400 mx-auto mb-2 opacity-80" />
            <h4 className="text-slate-400 text-sm">Próximo Alvo</h4>
            <div className="text-2xl font-bold text-white mb-1">
              {nextMilestone.percent}% ({nextMilestone.label})
            </div>
            <div className="text-sm text-slate-500">Faltam {nextMilestone.target - totalScore} reuniões no total</div>
          </div>
        </div>

        {/* PLAYER 2: HELOÍSA */}
        <PlayerCard
          name="Heloísa"
          score={heloisaScore}
          target={nextMilestone.target / 2}
          onAdd={() => setSchedulingPlayer("heloisa")}
          onRemove={() => removeMeeting("heloisa")}
          color="purple"
        />

        {/* RECENT MEETINGS FEED */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-md transition-all">
          <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => setIsMeetingsFeedOpen(!isMeetingsFeedOpen)}>
            <h3 className="text-xl font-bold text-white flex items-center gap-2 hover:text-cyan-400 transition-colors">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Agendamentos Registrados
            </h3>
            <div className="text-slate-400 hover:text-white transition-colors bg-slate-800/50 p-1.5 rounded-lg">
              {isMeetingsFeedOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>

          {isMeetingsFeedOpen && (
            <div className="flex gap-4 overflow-x-auto mt-4 pb-2 animate-in fade-in slide-in-from-top-2 duration-300">
              {meetingsList.length === 0 ? (
                <p className="text-slate-500 italic text-sm">Nenhum agendamento registrado ainda hoje.</p>
              ) : (
                meetingsList.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="min-w-[250px] bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-col gap-2"
                  >
                    {/* ✅ BLOCO CORRIGIDO (sem tags sobrando) + X para deletar */}
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-white truncate flex-1" title={meeting.opportunity}>
                        {meeting.opportunity}
                      </span>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded bg-slate-900 ${
                            meeting.sdr === "juan" ? "text-cyan-400" : "text-purple-400"
                          }`}
                        >
                          {meeting.sdr === "juan" ? "Juan" : "Heloísa"}
                        </span>

                        <button
                          type="button"
                          onClick={() => deleteMeetingById(meeting.id)}
                          className="text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-900 px-2 py-1 rounded"
                          title="Remover este agendamento"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Calendar className="w-3 h-3" /> {meeting.date}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <User className="w-3 h-3" /> AE: {meeting.ae}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* NO-SHOW TRACKER (Full Width Bottom) */}
        <div className="lg:col-span-3 bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Radar de No-Shows
              </h3>
              <p className="text-slate-400 text-sm">Atenção: 3º reagendamento é a última chance do lead.</p>
            </div>

            <form onSubmit={handleAddNoShow} className="flex w-full md:w-auto gap-2">
              <input
                type="text"
                placeholder="Nome da Empresa / Lead"
                value={newLeadName}
                onChange={(e) => setNewLeadName(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 w-full md:w-64 transition-all"
              />
              <select
                value={newLeadSdr}
                onChange={(e) => setNewLeadSdr(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all cursor-pointer"
              >
                <option value="juan">Juan</option>
                <option value="heloisa">Heloísa</option>
              </select>
              <button
                type="submit"
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" />
                Registrar
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {leads.length === 0 ? (
              <div className="col-span-full text-center py-8 text-slate-500 border border-dashed border-slate-700 rounded-xl">
                Nenhum no-show registrado no momento. Excelente trabalho!
              </div>
            ) : (
              leads.map((lead) => (
                <div
                  key={lead.id}
                  className={`p-4 rounded-xl border relative overflow-hidden flex flex-col justify-between transition-all ${
                    lead.noShows >= 3
                      ? "bg-red-950/30 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                      : lead.noShows === 2
                      ? "bg-yellow-950/30 border-yellow-500/50"
                      : "bg-slate-800/50 border-slate-700"
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-bold text-white truncate pr-4" title={lead.name}>
                      {lead.name}
                    </h4>
                    <button
                      onClick={() => removeLead(lead.id)}
                      className="text-slate-500 hover:text-white transition-colors absolute top-4 right-4"
                      title="Remover da lista"
                    >
                      ×
                    </button>
                  </div>

                  <div className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                    <User className="w-3 h-3" /> SDR:{" "}
                    <span className={lead.sdr === "juan" ? "text-cyan-400" : "text-purple-400"}>
                      {lead.sdr === "juan" ? "Juan" : "Heloísa"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map((strike) => (
                      <div
                        key={strike}
                        className={`h-2 flex-1 rounded-sm ${
                          strike <= lead.noShows
                            ? strike === 3
                              ? "bg-red-500 shadow-[0_0_8px_#ef4444]"
                              : strike === 2
                              ? "bg-yellow-500"
                              : "bg-slate-400"
                            : "bg-slate-800"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="mt-3 text-xs font-bold tracking-wider uppercase">
                    {lead.noShows >= 3 ? (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> ÚLTIMA CHANCE
                      </span>
                    ) : lead.noShows === 2 ? (
                      <span className="text-yellow-400">Atenção (2/3)</span>
                    ) : (
                      <span className="text-slate-400">1º Furo (1/3)</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* HISTÓRICO (abaixo do Radar) */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Histórico (meses anteriores)</h3>
            <button
              type="button"
              onClick={() => setHistoryOpen((s) => !s)}
              className="text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-800 px-3 py-2 rounded-lg"
            >
              {historyOpen ? "Fechar" : "Abrir"}
            </button>
          </div>

          {historyOpen && (
            <div className="mt-4">
              {historyMonths.length === 0 ? (
                <p className="text-slate-500 text-sm">Ainda não há meses anteriores registrados.</p>
              ) : (
                <>
                  <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                    <div className="text-slate-400 text-sm">Selecione o mês:</div>
                    <select
                      value={historySelected}
                      onChange={(e) => setHistorySelected(e.target.value)}
                      className="bg-slate-950 border border-slate-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500"
                    >
                      {historyMonths.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {historyData && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                        <div className="text-slate-400 text-xs uppercase">Total</div>
                        <div className="text-4xl font-black text-white">
                          {(historyData.juanScore || 0) + (historyData.heloisaScore || 0)}
                        </div>
                      </div>
                      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                        <div className="text-slate-400 text-xs uppercase">Juan</div>
                        <div className="text-4xl font-black text-cyan-400">{historyData.juanScore || 0}</div>
                      </div>
                      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                        <div className="text-slate-400 text-xs uppercase">Heloísa</div>
                        <div className="text-4xl font-black text-purple-400">{historyData.heloisaScore || 0}</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE AGENDAMENTO */}
      {schedulingPlayer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`bg-slate-900 border ${
              schedulingPlayer === "juan"
                ? "border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.2)]"
                : "border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.2)]"
            } rounded-2xl w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200`}
          >
            <button
              onClick={() => setSchedulingPlayer(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Calendar className={`w-6 h-6 ${schedulingPlayer === "juan" ? "text-cyan-400" : "text-purple-400"}`} />
              Novo Agendamento
            </h3>

            <form onSubmit={handleScheduleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-slate-400 text-sm mb-1 block">Oportunidade (Empresa)</label>
                <div className="relative">
                  <Briefcase className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={meetingForm.opportunity}
                    onChange={(e) => setMeetingForm({ ...meetingForm, opportunity: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors"
                    placeholder="Nome da empresa"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 text-sm mb-1 block">Data da Reunião</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="date"
                    required
                    value={meetingForm.date}
                    onChange={(e) => setMeetingForm({ ...meetingForm, date: e.target.value })}
                    onClick={(e) => e.target.showPicker && e.target.showPicker()}
                    className="w-full bg-slate-950 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Vendedor (AE)</label>
                  <select
                    value={meetingForm.ae}
                    onChange={(e) => setMeetingForm({ ...meetingForm, ae: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
                  >
                    <option value="Jânio">Jânio</option>
                    <option value="Grazi">Grazi</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">SDR</label>
                  <input
                    type="text"
                    readOnly
                    value={schedulingPlayer === "juan" ? "Juan" : "Heloísa"}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-500 px-4 py-2 rounded-lg cursor-not-allowed"
                  />
                </div>
              </div>

              <button
                type="submit"
                className={`mt-4 w-full py-3 rounded-xl font-bold text-white flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  schedulingPlayer === "juan" ? "bg-cyan-500 hover:bg-cyan-400" : "bg-purple-500 hover:bg-purple-400"
                }`}
              >
                <CheckCircle className="w-5 h-5" />
                Confirmar Agendamento
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- COMPONENTE DO CARD DO JOGADOR ---
function PlayerCard({ name, score, target, onAdd, onRemove, color }) {
  const isCyan = color === "cyan";
  const colorClasses = isCyan
    ? {
        text: "text-cyan-400",
        btnBg: "bg-cyan-500 hover:bg-cyan-400",
        shadow: "shadow-[0_0_20px_rgba(6,182,212,0.3)]",
      }
    : {
        text: "text-purple-400",
        btnBg: "bg-purple-500 hover:bg-purple-400",
        shadow: "shadow-[0_0_20px_rgba(168,85,247,0.3)]",
      };

  const progress = Math.min(100, (score / target) * 100);

  return (
    <div className={`bg-slate-900/80 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-md flex flex-col items-center justify-between transition-all duration-300`}>
      <h2 className={`text-2xl font-black ${colorClasses.text} tracking-wider uppercase mb-6`}>{name}</h2>

      {/* Círculo de Progresso */}
      <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Fundo */}
          <circle cx="50" cy="50" r="45" fill="none" className="stroke-slate-800" strokeWidth="6" />
          {/* Progresso */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            className={isCyan ? "stroke-cyan-500 transition-all duration-1000 ease-out" : "stroke-purple-500 transition-all duration-1000 ease-out"}
            strokeWidth="6"
            strokeDasharray="283"
            strokeDashoffset={283 - (283 * progress) / 100}
            style={{ filter: `drop-shadow(0 0 8px ${isCyan ? "#06b6d4" : "#a855f7"})` }}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-5xl font-black text-white">{score}</span>
          <span className="text-slate-400 text-xs uppercase mt-1">Reuniões</span>
        </div>
      </div>

      <div className="w-full mb-6 text-center">
        <p className="text-slate-400 text-sm">Próximo Marco Pessoal</p>
        <p className="text-white font-bold">{target} reuniões</p>
      </div>

      <div className="flex gap-3 w-full">
        <button onClick={onRemove} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-4 rounded-xl transition-colors" title="Remover reunião">
          -1
        </button>
        <button
          onClick={onAdd}
          className={`${colorClasses.btnBg} text-white flex-1 p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${colorClasses.shadow} hover:scale-105 active:scale-95`}
        >
          <CheckCircle className="w-5 h-5" />
          Agendar!
        </button>
      </div>
    </div>
  );
}

// --- COMPONENTE DE FOGOS DE ARTIFÍCIO (CANVAS) ---
function FireworksCanvas({ title = "META ATINGIDA!", subtitle = "Excelente trabalho equipe!" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let particles = [];
    const colors = ["#06b6d4", "#a855f7", "#3b82f6", "#f59e0b", "#ec4899"];

    function createFirework() {
      const x = Math.random() * canvas.width;
      const y = Math.random() * (canvas.height / 2);
      const color = colors[Math.floor(Math.random() * colors.length)];

      for (let i = 0; i < 50; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * (Math.random() * 10),
          vy: (Math.random() - 0.5) * (Math.random() * 10),
          life: 1,
          color,
          size: Math.random() * 3 + 1,
        });
      }
    }

    let animationId;
    let frameCount = 0;

    function animate() {
      ctx.fillStyle = "rgba(2, 6, 23, 0.2)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (frameCount % 15 === 0) createFirework();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= 0.01;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (p.life <= 0) particles.splice(i, 1);
      }

      frameCount++;
      animationId = requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="relative z-10 bg-slate-900/90 border-2 border-cyan-400 p-8 rounded-3xl text-center shadow-[0_0_50px_rgba(6,182,212,0.5)] animate-bounce">
        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-2">{title}</h2>
        <p className="text-white text-lg">{subtitle}</p>
      </div>
    </div>
  );
}