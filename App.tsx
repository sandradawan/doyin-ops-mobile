import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";

type Tab = "home" | "cash" | "scripts" | "pipeline" | "tasks";

type CashEntry = {
  id: string;
  type: "in" | "out";
  amount: number;
  note: string;
  date: string;
};

type Lead = {
  id: string;
  name: string;
  phone: string;
  stage: "new" | "chat" | "proposal" | "paid" | "lost";
  note: string;
  updatedAt: string;
};

type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
};

type Store = {
  businessName: string;
  cash: CashEntry[];
  leads: Lead[];
  tasks: Task[];
};

const STORAGE_KEY = "doyinops_v1";

const emptyStore = (): Store => ({
  businessName: "",
  cash: [],
  leads: [],
  tasks: [],
});

const SCRIPTS = [
  {
    id: "greeting",
    title: "Greeting + Menu",
    body: `Good {{time}} \uD83D\uDC4B\nYou're chatting with {{business}}.\n\nHow can we help you today?\n1. Pricing / packages\n2. Book a slot\n3. Support / complaint\n4. Other\n\nJust reply with a number.`,
  },
  {
    id: "price",
    title: "Price reply (ladder)",
    body: `Thanks for asking!\n\nHere are our current options:\n\u2022 Basic \u2014 \u20A6XX,XXX (core delivery)\n\u2022 Standard \u2014 \u20A6XX,XXX (most popular)\n\u2022 Premium \u2014 \u20A6XX,XXX (priority + extras)\n\nWhich one fits what you need? Or tell me your budget range and I'll recommend.`,
  },
  {
    id: "followup",
    title: "Soft follow-up",
    body: `Hi {{name}}, just checking in \uD83D\uDE4F\n\nDid you still want to go ahead with {{offer}}?\nI can hold the slot / start this week if you're ready.\n\nNo pressure \u2014 just reply YES and I'll send next steps.`,
  },
  {
    id: "deposit",
    title: "Deposit request",
    body: `To confirm your booking:\n\n\u2022 Package: {{offer}}\n\u2022 Deposit: 50% (\u20A6XX,XXX)\n\u2022 Balance: on delivery / completion\n\nPlease transfer to:\nBank: XXX\nAccount: XXXXXXXXXX\nName: {{business}}\n\nSend payment proof here and we'll lock your slot. Thank you!`,
  },
  {
    id: "paid",
    title: "Payment received",
    body: `Payment received \u2014 thank you! \u2705\n\nWe've confirmed your order/booking.\nYou'll get updates here. Expected delivery: {{date}}.\n\nIf anything changes, just message us on this chat.`,
  },
  {
    id: "review",
    title: "Ask for review / referral",
    body: `Hi {{name}}, hope you're happy with the result!\n\nIf it helped you, a short WhatsApp status / Google review would mean a lot \uD83D\uDE4F\nAnd if you know someone who needs the same, feel free to connect us.\n\nThank you for trusting {{business}}.`,
  },
];

const STAGES: Lead["stage"][] = ["new", "chat", "proposal", "paid", "lost"];
const STAGE_LABEL: Record<Lead["stage"], string> = {
  new: "New",
  chat: "In chat",
  proposal: "Proposal",
  paid: "Paid",
  lost: "Lost",
};

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const formatNgn = (n: number) =>
  "\u20A6" + Math.round(n).toLocaleString("en-NG");

function replaceVars(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [store, setStore] = useState<Store>(emptyStore());
  const [ready, setReady] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [cashType, setCashType] = useState<"in" | "out">("in");
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [bizName, setBizName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Store;
          setStore({ ...emptyStore(), ...parsed });
          setBizName(parsed.businessName || "");
        }
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const save = useCallback(async (next: Store) => {
    setStore(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const weekCash = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const from = start.toISOString().slice(0, 10);
    let inn = 0;
    let out = 0;
    for (const e of store.cash) {
      if (e.date >= from) {
        if (e.type === "in") inn += e.amount;
        else out += e.amount;
      }
    }
    return { in: inn, out, net: inn - out };
  }, [store.cash]);

  const openTasks = store.tasks.filter((t) => !t.done).length;
  const activeLeads = store.leads.filter(
    (l) => l.stage !== "paid" && l.stage !== "lost"
  ).length;

  const addCash = () => {
    const amount = Number(cashAmount.replace(/,/g, ""));
    if (!amount || amount <= 0) {
      Alert.alert("Enter a valid amount");
      return;
    }
    const entry: CashEntry = {
      id: uid(),
      type: cashType,
      amount,
      note: cashNote.trim() || (cashType === "in" ? "Money in" : "Money out"),
      date: today(),
    };
    save({ ...store, cash: [entry, ...store.cash].slice(0, 200) });
    setCashAmount("");
    setCashNote("");
  };

  const addLead = () => {
    if (!leadName.trim()) {
      Alert.alert("Enter a name");
      return;
    }
    const lead: Lead = {
      id: uid(),
      name: leadName.trim(),
      phone: leadPhone.trim(),
      stage: "new",
      note: "",
      updatedAt: new Date().toISOString(),
    };
    save({ ...store, leads: [lead, ...store.leads] });
    setLeadName("");
    setLeadPhone("");
  };

  const setLeadStage = (id: string, stage: Lead["stage"]) => {
    save({
      ...store,
      leads: store.leads.map((l) =>
        l.id === id ? { ...l, stage, updatedAt: new Date().toISOString() } : l
      ),
    });
  };

  const openWhatsApp = (phone: string, text?: string) => {
    const cleaned = phone.replace(/\D/g, "");
    const withCountry = cleaned.startsWith("234")
      ? cleaned
      : cleaned.startsWith("0")
        ? "234" + cleaned.slice(1)
        : cleaned;
    const url = text
      ? `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`
      : `https://wa.me/${withCountry}`;
    Linking.openURL(url).catch(() => Alert.alert("Could not open WhatsApp"));
  };

  const addTask = () => {
    if (!taskTitle.trim()) return;
    const t: Task = {
      id: uid(),
      title: taskTitle.trim(),
      done: false,
      createdAt: new Date().toISOString(),
    };
    save({ ...store, tasks: [t, ...store.tasks] });
    setTaskTitle("");
  };

  const toggleTask = (id: string) => {
    save({
      ...store,
      tasks: store.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    });
  };

  const saveBizName = () => {
    save({ ...store, businessName: bizName.trim() });
    Alert.alert("Saved", "Business name updated");
  };

  const copyScript = async (body: string) => {
    const vars = {
      business: store.businessName || "our business",
      time: new Date().getHours() < 12 ? "morning" : "afternoon",
      name: "there",
      offer: "the package we discussed",
      date: "this week",
    };
    const text = replaceVars(body, vars);
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Script copied. Paste into WhatsApp.");
  };

  if (!ready) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.muted}>Loading DoyinOps\u2026</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>DoyinOps</Text>
          <Text style={styles.sub}>
            {store.businessName || "Your SME command centre"}
          </Text>
        </View>
      </View>
      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "home" && (
          <View style={styles.section}>
            <Text style={styles.h2}>Today</Text>
            <View style={styles.row}>
              <Card
                label="Cash (7d net)"
                value={formatNgn(weekCash.net)}
                accent={weekCash.net >= 0 ? "#22c55e" : "#ef4444"}
              />
              <Card label="Active leads" value={String(activeLeads)} />
            </View>
            <View style={styles.row}>
              <Card label="Open tasks" value={String(openTasks)} />
              <Card
                label="Money in (7d)"
                value={formatNgn(weekCash.in)}
                accent="#22c55e"
              />
            </View>
            <Text style={[styles.h2, { marginTop: 20 }]}>Business name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ada Web Studio"
              placeholderTextColor="#64748b"
              value={bizName}
              onChangeText={setBizName}
            />
            <Btn label="Save name" onPress={saveBizName} />
            <Text style={[styles.muted, { marginTop: 24, lineHeight: 20 }]}>
              Track cash. Close chats. Run your small business from one phone
              screen. Data stays on your device.
            </Text>
          </View>
        )}
        {tab === "cash" && (
          <View style={styles.section}>
            <Text style={styles.h2}>Cash tracker</Text>
            <Text style={styles.muted}>Log every naira in and out.</Text>
            <View style={styles.segment}>
              <Pressable
                style={[styles.segBtn, cashType === "in" && styles.segActiveIn]}
                onPress={() => setCashType("in")}
              >
                <Text style={styles.segText}>Money in</Text>
              </Pressable>
              <Pressable
                style={[styles.segBtn, cashType === "out" && styles.segActiveOut]}
                onPress={() => setCashType("out")}
              >
                <Text style={styles.segText}>Money out</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Amount (e.g. 25000)"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              value={cashAmount}
              onChangeText={setCashAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Note (optional)"
              placeholderTextColor="#64748b"
              value={cashNote}
              onChangeText={setCashNote}
            />
            <Btn
              label={cashType === "in" ? "Add money in" : "Add money out"}
              onPress={addCash}
            />
            <Text style={[styles.h2, { marginTop: 24 }]}>Last 7 days</Text>
            <View style={styles.statRow}>
              <Text style={styles.statIn}>In {formatNgn(weekCash.in)}</Text>
              <Text style={styles.statOut}>Out {formatNgn(weekCash.out)}</Text>
              <Text style={styles.statNet}>Net {formatNgn(weekCash.net)}</Text>
            </View>
            {store.cash.slice(0, 30).map((e) => (
              <View key={e.id} style={styles.listItem}>
                <View>
                  <Text style={styles.listTitle}>{e.note}</Text>
                  <Text style={styles.muted}>{e.date}</Text>
                </View>
                <Text
                  style={{
                    color: e.type === "in" ? "#22c55e" : "#ef4444",
                    fontWeight: "700",
                  }}
                >
                  {e.type === "in" ? "+" : "\u2212"}
                  {formatNgn(e.amount)}
                </Text>
              </View>
            ))}
            {store.cash.length === 0 && (
              <Text style={styles.muted}>No entries yet. Log your first one.</Text>
            )}
          </View>
        )}
        {tab === "scripts" && (
          <View style={styles.section}>
            <Text style={styles.h2}>WhatsApp scripts</Text>
            <Text style={styles.muted}>
              Copy \u2192 paste into chat. Edit the \u20A6 amounts before sending.
            </Text>
            {SCRIPTS.map((s) => (
              <View key={s.id} style={styles.scriptCard}>
                <Text style={styles.listTitle}>{s.title}</Text>
                <Text style={styles.scriptBody} numberOfLines={6}>
                  {replaceVars(s.body, {
                    business: store.businessName || "our business",
                    time: "morning",
                    name: "there",
                    offer: "the package",
                    date: "this week",
                  })}
                </Text>
                <Btn label="Copy script" onPress={() => copyScript(s.body)} small />
              </View>
            ))}
          </View>
        )}
        {tab === "pipeline" && (
          <View style={styles.section}>
            <Text style={styles.h2}>Leads pipeline</Text>
            <TextInput
              style={styles.input}
              placeholder="Customer name"
              placeholderTextColor="#64748b"
              value={leadName}
              onChangeText={setLeadName}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone (e.g. 0803\u2026)"
              placeholderTextColor="#64748b"
              keyboardType="phone-pad"
              value={leadPhone}
              onChangeText={setLeadPhone}
            />
            <Btn label="Add lead" onPress={addLead} />
            {store.leads.map((l) => (
              <View key={l.id} style={styles.listItemCol}>
                <View style={styles.rowBetween}>
                  <Text style={styles.listTitle}>{l.name}</Text>
                  <Text style={styles.badge}>{STAGE_LABEL[l.stage]}</Text>
                </View>
                {!!l.phone && <Text style={styles.muted}>{l.phone}</Text>}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.stageRow}>
                    {STAGES.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => setLeadStage(l.id, s)}
                        style={[
                          styles.stageChip,
                          l.stage === s && styles.stageChipOn,
                        ]}
                      >
                        <Text style={styles.stageChipText}>{STAGE_LABEL[s]}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                {!!l.phone && (
                  <Btn
                    label="Open WhatsApp"
                    onPress={() => openWhatsApp(l.phone)}
                    small
                  />
                )}
              </View>
            ))}
            {store.leads.length === 0 && (
              <Text style={styles.muted}>No leads yet. Add your first chat.</Text>
            )}
          </View>
        )}
        {tab === "tasks" && (
          <View style={styles.section}>
            <Text style={styles.h2}>Today\u2019s tasks</Text>
            <TextInput
              style={styles.input}
              placeholder="What must get done?"
              placeholderTextColor="#64748b"
              value={taskTitle}
              onChangeText={setTaskTitle}
              onSubmitEditing={addTask}
            />
            <Btn label="Add task" onPress={addTask} />
            {store.tasks.map((t) => (
              <Pressable
                key={t.id}
                style={styles.listItem}
                onPress={() => toggleTask(t.id)}
              >
                <Text style={{ fontSize: 18 }}>{t.done ? "\u2705" : "\u2B1C"}</Text>
                <Text
                  style={[
                    styles.listTitle,
                    t.done && {
                      textDecorationLine: "line-through",
                      opacity: 0.5,
                    },
                  ]}
                >
                  {t.title}
                </Text>
              </Pressable>
            ))}
            {store.tasks.length === 0 && (
              <Text style={styles.muted}>
                No tasks. Add your Most Important Task.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
      <View style={styles.nav}>
        {(
          [
            ["home", "Home"],
            ["cash", "Cash"],
            ["scripts", "Scripts"],
            ["pipeline", "Leads"],
            ["tasks", "Tasks"],
          ] as const
        ).map(([id, label]) => (
          <Pressable key={id} style={styles.navItem} onPress={() => setTab(id)}>
            <Text style={[styles.navText, tab === id && styles.navTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function Card({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardValue, accent ? { color: accent } : null]}>
        {value}
      </Text>
    </View>
  );
}

function Btn({
  label,
  onPress,
  small,
}: {
  label: string;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.btn, small && { paddingVertical: 10, marginTop: 8 }]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1220" },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  brand: { color: "#fff", fontSize: 22, fontWeight: "800" },
  sub: { color: "#94a3b8", fontSize: 13, marginTop: 2 },
  body: { flex: 1 },
  section: { padding: 20 },
  h2: { color: "#f8fafc", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  muted: { color: "#94a3b8", fontSize: 13 },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  card: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  cardLabel: { color: "#94a3b8", fontSize: 12, marginBottom: 6 },
  cardValue: { color: "#fff", fontSize: 18, fontWeight: "800" },
  input: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    marginTop: 10,
    fontSize: 15,
  },
  btn: {
    backgroundColor: "#f97316",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  btnText: { color: "#000", fontWeight: "800", fontSize: 15 },
  segment: { flexDirection: "row", gap: 8, marginTop: 12 },
  segBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
  },
  segActiveIn: { borderColor: "#22c55e", backgroundColor: "#14532d55" },
  segActiveOut: { borderColor: "#ef4444", backgroundColor: "#7f1d1d55" },
  segText: { color: "#e2e8f0", fontWeight: "600" },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  statIn: { color: "#22c55e", fontWeight: "700" },
  statOut: { color: "#ef4444", fontWeight: "700" },
  statNet: { color: "#f8fafc", fontWeight: "700" },
  listItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    gap: 12,
  },
  listItemCol: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    gap: 6,
  },
  listTitle: { color: "#f1f5f9", fontSize: 15, fontWeight: "600" },
  scriptCard: {
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  scriptBody: { color: "#cbd5e1", fontSize: 13, marginTop: 8, lineHeight: 19 },
  badge: {
    color: "#f97316",
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "#431407",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
  },
  stageRow: { flexDirection: "row", gap: 6, marginVertical: 8 },
  stageChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#1e293b",
  },
  stageChipOn: { backgroundColor: "#f97316" },
  stageChipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    backgroundColor: "#0b1220",
    paddingBottom: 8,
    paddingTop: 6,
  },
  navItem: { flex: 1, alignItems: "center", paddingVertical: 8 },
  navText: { color: "#64748b", fontSize: 12, fontWeight: "600" },
  navTextOn: { color: "#f97316" },
});
