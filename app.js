import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Chart from "https://esm.sh/chart.js/auto";

const SUPABASE_URL = "https://gwetkvybdbnuhservzio.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_twnC9xGfjx4W2UwMpKpBaA_lZ1GjG2T";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const REQUEST_TIMEOUT_MS = 15000;
let syncRunId = 0;
let initialRefreshDone = false;

const state = {
  session: null,
  profile: null,
  logs: [],
  conditionScore: null,
  moodScore: null,
  chart: null,
};

const el = {
  authView: document.querySelector("#authView"),
  appView: document.querySelector("#appView"),
  authForm: document.querySelector("#authForm"),
  emailInput: document.querySelector("#emailInput"),
  passwordInput: document.querySelector("#passwordInput"),
  signUpButton: document.querySelector("#signUpButton"),
  signOutButton: document.querySelector("#signOutButton"),
  logForm: document.querySelector("#logForm"),
  profileForm: document.querySelector("#profileForm"),
  logDate: document.querySelector("#logDate"),
  weightKg: document.querySelector("#weightKg"),
  bodyFatPercent: document.querySelector("#bodyFatPercent"),
  sleepHours: document.querySelector("#sleepHours"),
  exerciseLevel: document.querySelector("#exerciseLevel"),
  mealNote: document.querySelector("#mealNote"),
  note: document.querySelector("#note"),
  conditionScore: document.querySelector("#conditionScore"),
  moodScore: document.querySelector("#moodScore"),
  displayName: document.querySelector("#displayName"),
  targetWeight: document.querySelector("#targetWeight"),
  heightCm: document.querySelector("#heightCm"),
  currentWeight: document.querySelector("#currentWeight"),
  goalDistance: document.querySelector("#goalDistance"),
  averageWeight: document.querySelector("#averageWeight"),
  insightText: document.querySelector("#insightText"),
  weeklyLoggedDays: document.querySelector("#weeklyLoggedDays"),
  weeklyAverageWeight: document.querySelector("#weeklyAverageWeight"),
  weeklyWeightDelta: document.querySelector("#weeklyWeightDelta"),
  weeklyAverageSleep: document.querySelector("#weeklyAverageSleep"),
  weeklyAverageCondition: document.querySelector("#weeklyAverageCondition"),
  weeklyAverageMood: document.querySelector("#weeklyAverageMood"),
  weeklyInsight: document.querySelector("#weeklyInsight"),
  aiWeeklyComment: document.querySelector("#aiWeeklyComment"),
  generateAiCommentButton: document.querySelector("#generateAiCommentButton"),
  formMessage: document.querySelector("#formMessage"),
  syncStatus: document.querySelector("#syncStatus"),
  entryStatus: document.querySelector("#entryStatus"),
  saveLogButton: document.querySelector("#saveLogButton"),
  weightChart: document.querySelector("#weightChart"),
  recentLogs: document.querySelector("#recentLogs"),
};

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function dateToIso(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  return Number(value);
}

function formatKg(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} kg` : "-- kg";
}

function average(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function parseLocalDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`);
}

function startOfWeek(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfWeek(start) {
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return end;
}

function logsBetween(start, end) {
  return state.logs.filter((log) => {
    const date = parseLocalDate(log.log_date);
    return date >= start && date < end;
  });
}

function currentWeeklySummary() {
  const thisStart = startOfWeek();
  const thisEnd = endOfWeek(thisStart);
  const lastStart = new Date(thisStart);
  lastStart.setDate(lastStart.getDate() - 7);
  const thisWeek = logsBetween(thisStart, thisEnd);
  const lastWeek = logsBetween(lastStart, thisStart);
  const avgWeight = average(thisWeek.map((log) => log.weight_kg));
  const lastAvgWeight = average(lastWeek.map((log) => log.weight_kg));
  const avgSleep = average(thisWeek.map((log) => log.sleep_hours));
  const avgCondition = average(thisWeek.map((log) => log.condition_score));
  const avgMood = average(thisWeek.map((log) => log.mood_score));
  const delta = Number.isFinite(avgWeight) && Number.isFinite(lastAvgWeight) ? avgWeight - lastAvgWeight : null;

  return {
    weekStart: dateToIso(thisStart),
    weekEnd: dateToIso(new Date(thisEnd.getTime() - 86400000)),
    loggedDays: thisWeek.length,
    avgWeight,
    lastAvgWeight,
    avgSleep,
    avgCondition,
    avgMood,
    delta,
    targetWeight: toNumber(state.profile?.target_weight_kg),
    logs: thisWeek.map((log) => ({
      date: log.log_date,
      weightKg: Number(log.weight_kg),
      bodyFatPercent: toNumber(log.body_fat_percent),
      sleepHours: toNumber(log.sleep_hours),
      conditionScore: log.condition_score,
      moodScore: log.mood_score,
      exerciseLevel: log.exercise_level,
      hasMealNote: Boolean(log.meal_note),
      note: log.note,
    })),
  };
}

function setMessage(message, isError = false) {
  el.formMessage.textContent = message;
  el.formMessage.classList.toggle("error", isError);
}

function setSyncStatus(message = "", kind = "") {
  el.syncStatus.textContent = message;
  el.syncStatus.classList.toggle("hidden", !message);
  el.syncStatus.classList.toggle("success", kind === "success");
}

function isSyncMessage(message) {
  return message.includes("同期") || message.includes("読み込み") || message.includes("時間がかかっています");
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function withTimeout(promise, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label}に時間がかかっています。通信状態を確認して、もう一度試してください。`));
    }, REQUEST_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function buildScoreButtons(container, key) {
  container.innerHTML = "";
  for (let score = 1; score <= 5; score += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = score;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.addEventListener("click", () => {
      state[key] = score;
      [...container.children].forEach((child) => child.setAttribute("aria-checked", "false"));
      button.setAttribute("aria-checked", "true");
    });
    container.append(button);
  }
}

function setScore(container, key, value) {
  state[key] = value;
  [...container.children].forEach((child) => {
    child.setAttribute("aria-checked", String(Number(child.textContent) === value));
  });
}

function showAuthenticated(isAuthenticated) {
  el.authView.classList.toggle("hidden", isAuthenticated);
  el.appView.classList.toggle("hidden", !isAuthenticated);
  el.signOutButton.classList.toggle("hidden", !isAuthenticated);
}

async function loadProfile() {
  const userId = state.session.user.id;
  const { data, error } = await withTimeout(
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    "目標設定の読み込み"
  );
  if (error) throw error;
  state.profile = data;
  el.displayName.value = data?.display_name ?? "";
  el.targetWeight.value = data?.target_weight_kg ?? "";
  el.heightCm.value = data?.height_cm ?? "";
}

async function loadLogs() {
  const { data, error } = await withTimeout(
    supabase.from("daily_logs").select("*").order("log_date", { ascending: true }).limit(180),
    "記録の読み込み"
  );
  if (error) throw error;
  state.logs = data ?? [];
  renderDashboard();
  renderWeeklyReview();
  await loadWeeklyAiComment();
  renderRecentLogs();
  renderChart();
  fillTodayIfExists();
}

async function loadWeeklyAiComment() {
  const summary = currentWeeklySummary();
  const { data, error } = await withTimeout(
    supabase
      .from("ai_comments")
      .select("content")
      .eq("comment_type", "weekly")
      .eq("target_date", summary.weekStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "AIコメントの読み込み"
  );
  if (error) throw error;
  el.aiWeeklyComment.textContent =
    data?.content ?? "OpenAI APIキーを設定すると、今週の記録からコメントを生成できます。";
}

function fillTodayIfExists() {
  const log = state.logs.find((item) => item.log_date === el.logDate.value);
  if (!log) {
    el.entryStatus.textContent = "未保存の日付です。入力して保存できます。";
    return;
  }
  el.weightKg.value = log.weight_kg ?? "";
  el.bodyFatPercent.value = log.body_fat_percent ?? "";
  el.sleepHours.value = log.sleep_hours ?? "";
  el.exerciseLevel.value = log.exercise_level ?? "none";
  el.mealNote.value = log.meal_note ?? "";
  el.note.value = log.note ?? "";
  setScore(el.conditionScore, "conditionScore", log.condition_score);
  setScore(el.moodScore, "moodScore", log.mood_score);
  el.entryStatus.textContent = `${log.log_date} は保存済みです。内容を編集して上書きできます。`;
}

function renderDashboard() {
  const latest = [...state.logs].reverse().find((log) => Number.isFinite(Number(log.weight_kg)));
  const recent = state.logs.slice(-7).map((log) => Number(log.weight_kg)).filter(Number.isFinite);
  const average = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : null;
  const target = toNumber(state.profile?.target_weight_kg);
  const current = latest ? Number(latest.weight_kg) : null;

  el.currentWeight.textContent = formatKg(current);
  el.averageWeight.textContent = formatKg(average);
  el.goalDistance.textContent =
    Number.isFinite(current) && Number.isFinite(target) ? formatKg(Math.abs(current - target)) : "-- kg";
  el.insightText.textContent = buildInsight(current, average, target);
}

function buildInsight(current, average, target) {
  if (!state.logs.length) return "最初の記録を保存すると、ここに短い振り返りが出ます。";
  if (!Number.isFinite(current)) return "体重を記録すると、目標との差や平均を見られます。";
  if (Number.isFinite(target)) {
    const diff = current - target;
    if (Math.abs(diff) < 0.2) return "目標体重のすぐ近くです。今日の数字より、続いている流れを見ていきましょう。";
    if (diff > 0) return `目標まであと${diff.toFixed(1)} kgです。7日平均を見ながら、無理なく進めましょう。`;
    return `目標より${Math.abs(diff).toFixed(1)} kg低い状態です。体調スコアも一緒に見ていきましょう。`;
  }
  if (Number.isFinite(average)) return `直近7日平均は${average.toFixed(1)} kgです。まずは記録をためて傾向を見ましょう。`;
  return "今日の記録が入りました。数日たまると平均とグラフが育ちます。";
}

function renderChart() {
  const labels = state.logs.map((log) => log.log_date.slice(5));
  const weights = state.logs.map((log) => Number(log.weight_kg));
  const target = toNumber(state.profile?.target_weight_kg);
  const datasets = [
    {
      label: "体重",
      data: weights,
      borderColor: "#2f7d6f",
      backgroundColor: "rgba(47, 125, 111, 0.14)",
      tension: 0.25,
      pointRadius: 3,
    },
  ];

  if (Number.isFinite(target)) {
    datasets.push({
      label: "目標",
      data: labels.map(() => target),
      borderColor: "#9a4b2e",
      borderDash: [6, 5],
      pointRadius: 0,
    });
  }

  if (state.chart) {
    state.chart.data.labels = labels;
    state.chart.data.datasets = datasets;
    state.chart.update();
    return;
  }

  state.chart = new Chart(el.weightChart, {
    type: "line",
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { ticks: { callback: (value) => `${value} kg` } } },
    },
  });
}

function renderWeeklyReview() {
  const { thisWeek, avgWeight, lastAvgWeight, avgSleep, avgCondition, avgMood, delta } = {
    thisWeek: logsBetween(startOfWeek(), endOfWeek(startOfWeek())),
    ...currentWeeklySummary(),
  };
  el.weeklyLoggedDays.textContent = `${thisWeek.length} / 7日`;
  el.weeklyAverageWeight.textContent = formatKg(avgWeight);
  el.weeklyWeightDelta.textContent = Number.isFinite(delta) ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} kg` : "-- kg";
  el.weeklyAverageSleep.textContent = Number.isFinite(avgSleep) ? `${avgSleep.toFixed(1)} h` : "-- h";
  el.weeklyAverageCondition.textContent = Number.isFinite(avgCondition) ? `${avgCondition.toFixed(1)} / 5` : "-- / 5";
  el.weeklyAverageMood.textContent = Number.isFinite(avgMood) ? `${avgMood.toFixed(1)} / 5` : "-- / 5";
  el.weeklyInsight.textContent = buildWeeklyInsight({ thisWeek, avgWeight, lastAvgWeight, avgSleep, avgCondition, avgMood, delta });
}

function buildWeeklyInsight({ thisWeek, avgWeight, avgSleep, avgCondition, avgMood, delta }) {
  if (!thisWeek.length) return "今週の記録はまだありません。1日分入ると、ここから振り返りが始まります。";
  const notes = [];
  notes.push(thisWeek.length >= 5 ? `今週は${thisWeek.length}日記録できています。かなり振り返りやすい量です。` : `今週は${thisWeek.length}日分の記録があります。まずは数字をためて傾向を見ましょう。`);
  if (Number.isFinite(delta)) {
    if (Math.abs(delta) < 0.15) notes.push("平均体重は先週とほぼ同じで、流れとしては安定しています。");
    else if (delta < 0) notes.push(`平均体重は先週より${Math.abs(delta).toFixed(1)} kg低めです。`);
    else notes.push(`平均体重は先週より${delta.toFixed(1)} kg高めです。日々の増減より平均で見ていきましょう。`);
  } else if (Number.isFinite(avgWeight)) {
    notes.push(`今週の平均体重は${avgWeight.toFixed(1)} kgです。先週分がたまると比較できます。`);
  }
  const shortSleepLogs = thisWeek.filter((log) => Number(log.sleep_hours) > 0 && Number(log.sleep_hours) < 6);
  if (shortSleepLogs.length >= 2) notes.push(`睡眠6時間未満の日が${shortSleepLogs.length}日あります。体調や気分との関係を見ていきたいところです。`);
  else if (Number.isFinite(avgSleep) && avgSleep >= 7) notes.push("睡眠時間は比較的しっかり取れている週に見えます。");
  if (Number.isFinite(avgCondition) && Number.isFinite(avgMood)) {
    if (avgCondition < 3 || avgMood < 3) notes.push("体調か気分の平均が少し低めです。体重より先にコンディションを見てもよさそうです。");
    else if (avgCondition >= 4 && avgMood >= 4) notes.push("体調と気分はどちらも高めで、生活の手応えがありそうです。");
  }
  return notes.join(" ");
}

function renderRecentLogs() {
  const recent = [...state.logs].reverse().slice(0, 7);
  if (!recent.length) {
    el.recentLogs.innerHTML = '<p class="status-line">まだ記録がありません。</p>';
    return;
  }
  el.recentLogs.innerHTML = recent.map((log) => {
    const detail = [
      log.sleep_hours ? `睡眠 ${Number(log.sleep_hours).toFixed(1)}h` : null,
      log.condition_score ? `体調 ${log.condition_score}` : null,
      log.mood_score ? `気分 ${log.mood_score}` : null,
    ].filter(Boolean).join(" / ");
    return `<button class="recent-log-row" type="button" data-log-date="${log.log_date}"><span>${log.log_date}<br>${detail || "詳細なし"}</span><strong>${Number(log.weight_kg).toFixed(1)} kg</strong></button>`;
  }).join("");
}

async function refreshApp() {
  const currentRun = ++syncRunId;
  setSyncStatus("データを同期しています。少しだけ待ってください。");
  await waitForPaint();
  try {
    await loadProfile();
    await loadLogs();
    await waitForPaint();
    if (currentRun === syncRunId) {
      setSyncStatus("同期完了しました。", "success");
      window.setTimeout(() => {
        if (currentRun === syncRunId) setSyncStatus("");
      }, 1400);
    }
  } catch (error) {
    if (currentRun === syncRunId) setSyncStatus(error.message || "同期できませんでした。", "");
  }
}

function scheduleFollowUpRefresh() {
  if (initialRefreshDone) return;
  initialRefreshDone = true;
  window.setTimeout(() => { if (state.session) refreshApp(); }, 900);
  window.setTimeout(() => { if (state.session) refreshApp(); }, 2500);
}

el.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const { error } = await supabase.auth.signInWithPassword({ email: el.emailInput.value, password: el.passwordInput.value });
  if (error) {
    setMessage(error.message, true);
    return;
  }
  setMessage("");
});

el.signUpButton.addEventListener("click", async () => {
  const { error } = await supabase.auth.signUp({ email: el.emailInput.value, password: el.passwordInput.value, options: { emailRedirectTo: window.location.origin } });
  if (error) {
    setMessage(error.message, true);
    return;
  }
  setMessage("登録しました。確認メールが届いた場合は、メール内のリンクを開いてからログインしてください。");
});

el.signOutButton.addEventListener("click", async () => { await supabase.auth.signOut(); });

el.profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const userId = state.session?.user?.id;
    if (!userId) throw new Error("ログイン状態が切れています。もう一度ログインしてください。");
    const payload = { id: userId, display_name: el.displayName.value.trim() || null, target_weight_kg: toNumber(el.targetWeight.value), height_cm: toNumber(el.heightCm.value), updated_at: new Date().toISOString() };
    const { error } = await withTimeout(supabase.from("profiles").upsert(payload), "目標設定の保存");
    if (error) throw error;
    setMessage("目標を保存しました。");
    await refreshApp();
  } catch (error) {
    console.error(error);
    setMessage(error.message || "目標を保存できませんでした。", true);
  }
});

el.logForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  el.saveLogButton.disabled = true;
  el.saveLogButton.textContent = "保存中";
  try {
    const userId = state.session?.user?.id;
    if (!userId) throw new Error("ログイン状態が切れています。もう一度ログインしてください。");
    if (!state.conditionScore || !state.moodScore) throw new Error("体調と気分を1〜5で選んでください。");
    const payload = { user_id: userId, log_date: el.logDate.value, weight_kg: toNumber(el.weightKg.value), body_fat_percent: toNumber(el.bodyFatPercent.value), sleep_hours: toNumber(el.sleepHours.value), condition_score: state.conditionScore, mood_score: state.moodScore, exercise_level: el.exerciseLevel.value, meal_note: el.mealNote.value.trim() || null, note: el.note.value.trim() || null, updated_at: new Date().toISOString() };
    const { error } = await withTimeout(supabase.from("daily_logs").upsert(payload, { onConflict: "user_id,log_date" }), "記録の保存");
    if (error) throw error;
    setMessage("保存しました。今日の記録、ちゃんと積み上がりました。");
    await loadLogs();
  } catch (error) {
    console.error(error);
    setMessage(error.message || "保存できませんでした。", true);
  } finally {
    el.saveLogButton.disabled = false;
    el.saveLogButton.textContent = "保存";
  }
});

el.recentLogs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-log-date]");
  if (!button) return;
  el.logDate.value = button.dataset.logDate;
  fillTodayIfExists();
  el.logForm.scrollIntoView({ behavior: "smooth", block: "start" });
});

el.generateAiCommentButton.addEventListener("click", async () => {
  const summary = currentWeeklySummary();
  if (!summary.loggedDays) {
    setMessage("今週の記録がまだありません。記録を保存してからAIコメントを生成できます。", true);
    return;
  }
  el.generateAiCommentButton.disabled = true;
  el.generateAiCommentButton.textContent = "生成中";
  el.aiWeeklyComment.textContent = "AIが今週の記録を読んでいます。";
  try {
    const response = await withTimeout(fetch("/api/weekly-comment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary }) }), "AIコメントの生成");
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "AIコメントを生成できませんでした。");
    el.aiWeeklyComment.textContent = result.comment;
    setMessage("AIコメントを生成しました。");
    const { error } = await withTimeout(supabase.from("ai_comments").insert({ user_id: state.session.user.id, comment_type: "weekly", target_date: summary.weekStart, content: result.comment }), "AIコメントの保存");
    if (error) throw error;
  } catch (error) {
    console.error(error);
    const message = error.message || "AIコメントを生成できませんでした。";
    el.aiWeeklyComment.textContent = message;
    setMessage(message, true);
  } finally {
    el.generateAiCommentButton.disabled = false;
    el.generateAiCommentButton.textContent = "生成";
  }
});

el.logDate.addEventListener("change", () => {
  const selectedDate = el.logDate.value || todayIso();
  el.logForm.reset();
  el.logDate.value = selectedDate;
  setScore(el.conditionScore, "conditionScore", null);
  setScore(el.moodScore, "moodScore", null);
  fillTodayIfExists();
});

supabase.auth.onAuthStateChange(async (_event, session) => {
  state.session = session;
  showAuthenticated(Boolean(session));
  if (session) {
    try {
      await refreshApp();
      scheduleFollowUpRefresh();
    } catch (error) {
      setSyncStatus("");
      if (!isSyncMessage(error.message || "")) setMessage(error.message, true);
    }
  }
});

buildScoreButtons(el.conditionScore, "conditionScore");
buildScoreButtons(el.moodScore, "moodScore");
el.logDate.value = todayIso();

const { data } = await supabase.auth.getSession();
state.session = data.session;
showAuthenticated(Boolean(data.session));
if (data.session) {
  try {
    await refreshApp();
    scheduleFollowUpRefresh();
  } catch (error) {
    setSyncStatus("");
    if (!isSyncMessage(error.message || "")) setMessage(error.message, true);
  }
}
