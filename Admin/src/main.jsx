import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Ban,
  Coins,
  HeartPulse,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Save,
  Search,
  Shield,
  Users,
  Wand2
} from "lucide-react";
import "./styles.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const tokenFromQuery = new URLSearchParams(window.location.search).get("token") || "";
// Dev login credentials (frontend-only). Keep in sync with your backend if used in production.
const ADMIN_LOGIN = { email: "thymonsterbot003", pass: "Moons00327!" };
const pages = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "players", label: "Players", icon: Users },
  { key: "health", label: "Health", icon: HeartPulse },
  { key: "errors", label: "Error Ledger", icon: AlertTriangle },
  { key: "moderation", label: "Moderation", icon: Shield }
];

const tierBalls = { LOW: "⚪", MID: "🟢", TOP: "🔵", LEGEND: "🟣", ULTRA: "🔴" };
const tierScore = { LOW: 1, MID: 2, TOP: 3, LEGEND: 4, ULTRA: 5 };

function format(value) {
  return Number(value || 0).toLocaleString();
}

function getToken() {
  return localStorage.getItem("dojka_admin_token") || tokenFromQuery;
}

function getRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "").trim();
  if (hash) return hash;
  const path = window.location.pathname.replace(/\/$/, "").split("/").pop();
  return !path || path === "admin" ? "dashboard" : path;
}

async function api(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : { message: await response.text().catch(() => response.statusText) };
    throw new Error(body.error || body.message || response.statusText);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

function workerScore(workers = []) {
  return workers.reduce((sum, worker) => sum + (tierScore[worker.level] || 0), 0);
}

function workerOutput(workers = []) {
  const tierStars = { LOW: 2, MID: 5, TOP: 12, LEGEND: 25, ULTRA: 50 };
  return workers.reduce((sum, worker) => sum + (tierStars[worker.level] || 0), 0);
}

function App() {
  const [token, setToken] = useState(getToken());
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [route, setRoute] = useState(getRoute());
  const [form, setForm] = useState({ stars: 0, hp: 100, isBanned: false, shadows: "[]" });

  const selectedStats = useMemo(() => {
    const workers = selected?.shadows || [];
    return {
      workers: workers.length,
      output: workerOutput(workers),
      score: workerScore(workers),
      power: workers.reduce((sum, worker) => sum + (Number(worker.power) || 0), 0)
    };
  }, [selected]);

  const bannedUsers = useMemo(() => (Array.isArray(users) ? users.filter((user) => user.isBanned) : []), [users]);
  const lowHealthUsers = useMemo(() => (Array.isArray(users) ? users.filter((user) => Number(user.hp) < 60) : []), [users]);

  async function refresh() {
    setError("");
    try {
      const [summaryData, userData] = await Promise.all([
        api("/api/admin/summary"),
        api(`/api/admin/users?q=${encodeURIComponent(query)}`)
      ]);
      setSummary(summaryData);
      // Normalize users response to always be an array
      const normalizedUsers = Array.isArray(userData) ? userData : (userData?.users ?? []);
      setUsers(normalizedUsers);
    } catch (err) {
      setError(err.message);
    }
  }

  async function selectUser(id) {
    setError("");
    try {
      const user = await api(`/api/admin/users/${id}`);
      setSelected(user);
      setForm({
        stars: user.stars ?? 0,
        hp: user.hp ?? 100,
        isBanned: Boolean(user.isBanned),
        shadows: JSON.stringify(user.shadows || [], null, 2)
      });
      setSidebarOpen(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveUser(event) {
    event.preventDefault();
    if (!selected) return;
    setError("");

    try {
      await api(`/api/admin/users/${selected.telegramId}`, {
        method: "PATCH",
        body: JSON.stringify({
          stars: Number(form.stars),
          hp: Number(form.hp),
          isBanned: form.isBanned,
          shadows: JSON.parse(form.shadows || "[]")
        })
      });
      await selectUser(selected.telegramId);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function navigate(page) {
    const targetPath = page === "dashboard" ? "/admin" : `/admin/${page}`;
    if (window.location.pathname.startsWith("/admin")) {
      window.history.pushState({}, "", targetPath);
    } else {
      window.history.pushState({}, "", `#${page}`);
    }
    setRoute(page);
  }

  useEffect(() => {
    if (token) {
      localStorage.setItem("dojka_admin_token", token);
    }
    refresh();
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(refresh, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleRouteChange = () => setRoute(getRoute());
    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);
    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      window.removeEventListener("hashchange", handleRouteChange);
    };
  }, []);

  const metrics = [
    { label: "Users", value: summary?.users, icon: Users, tone: "green" },
    { label: "Total Stars", value: format(summary?.totalStars), icon: Coins, tone: "gold" },
    { label: "Incarnations", value: summary?.totalIncarnations, icon: Wand2, tone: "blue" },
    { label: "Banned", value: summary?.bannedUsers, icon: Ban, tone: "red" }
  ];

  const page = pages.find((pageItem) => pageItem.key === route) || pages[0];

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brandMark">KD</div>
          <div>
            <strong>Kim Com</strong>
            <span>Star Stream Control</span>
          </div>
        </div>

        <nav>
          {pages.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={route === key ? "active" : ""}
              onClick={() => navigate(key)}
              type="button"
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>

        <div className="ownerCard">
          <span>Kim Dojka says</span>
          <b>This story is for just one reader.</b>
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <button className="iconBtn" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20} /></button>
          <div>
            <span className="kicker">Admin Panel</span>
            <h1>{page.label}</h1>
          </div>
          <div className="tokenBox">
            {!token ? (
              <form onSubmit={(e) => { e.preventDefault(); const email = e.target.email?.value?.trim(); const pass = e.target.password?.value || ""; if (email === ADMIN_LOGIN.email && pass === ADMIN_LOGIN.pass) { setToken(pass); localStorage.setItem("dojka_admin_token", pass); setError(""); refresh(); } else { setError("Invalid login credentials."); } }}>
                <input name="email" defaultValue={ADMIN_LOGIN.email} placeholder="email" />
                <input name="password" placeholder="password" type="password" />
                <button type="submit"><Save size={16} /> Login</button>
              </form>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#9eafca' }}>Signed in</span>
                <button type="button" onClick={() => { setToken(""); localStorage.removeItem("dojka_admin_token"); setSelected(null); setError(""); }}><RefreshCw size={16} /> Logout</button>
                <button type="button" onClick={refresh}><RefreshCw size={16} /> Sync</button>
              </div>
            )}
          </div>
        </header>

        {error && <div className="notice"><AlertTriangle size={18} /> {error}</div>}

        {route === "dashboard" && (
          <>
            <section className="metricGrid">
              {metrics.map(({ label, value, icon: Icon, tone }) => (
                <article className="metric" key={label}>
                  <div>
                    <span>{label}</span>
                    <strong>{value ?? "-"}</strong>
                  </div>
                  <i className={tone}><Icon size={22} /></i>
                </article>
              ))}
            </section>

            <section className="bottomGrid">
              <article className="panel">
                <span className="kicker">Recent Errors</span>
                <h2>Incident ledger</h2>
                <div className="errorList">
                  {(summary?.recentErrors || []).length ? summary.recentErrors.map((err, index) => (
                    <div className="errorItem" key={`${err.at}-${index}`}>
                      <b>{err.source}</b>
                      <span>{err.message}</span>
                      <small>{err.at}</small>
                    </div>
                  )) : <p>No incidents. Suspicious, but profitable.</p>}
                </div>
              </article>

              <article className="panel">
                <span className="kicker">Backend Context</span>
                <h2>Selected raw ledger</h2>
                <pre>{selected ? JSON.stringify(selected, null, 2) : "No player selected."}</pre>
              </article>
            </section>
          </>
        )}

        {route === "players" && (
          <section className="contentGrid">
            <article className="panel playerPanel">
              <div className="panelHead">
                <div>
                  <span className="kicker">Players</span>
                  <h2>Estate workforce registry</h2>
                </div>
                <label className="search">
                  <Search size={16} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, name, username" />
                </label>
              </div>
              <div className="userList">
                {Array.isArray(users) ? users.map((user) => (
                  <button className={`userRow ${selected?.telegramId === user.telegramId ? "selected" : ""}`} key={user.telegramId} onClick={() => selectUser(user.telegramId)}>
                    <span>
                      <b>{user.firstName || "Unnamed Worker"}</b>
                      <small>@{user.username || "none"} · {user.telegramId}</small>
                    </span>
                    <em>{format(user.stars)} ⭐ Stars</em>
                    <small>{user.incarnations} incarnations · {user.hp}/100 HP</small>
                  </button>
                )) : <div className="empty">No users available.</div>}
              </div>
            </article>

            <article className="panel profilePanel">
              <div className="panelHead">
                <div>
                  <span className="kicker">Player Control</span>
                  <h2>{selected ? selected.firstName || selected.telegramId : "Select a player"}</h2>
                </div>
                {selected && <span className="pill">{selected.isBanned ? "Banned" : "Active"}</span>}
              </div>
              {selected ? (
                <>
                  <div className="miniStats">
                    <div><span>Workers</span><b>{selectedStats.workers}</b></div>
                    <div><span>Output</span><b>{selectedStats.output} RP/hr</b></div>
                    <div><span>Score</span><b>{selectedStats.score}</b></div>
                    <div><span>Power</span><b>{selectedStats.power}</b></div>
                  </div>
                  <form className="editor" onSubmit={saveUser}>
                     <label>Stars<input type="number" min="0" value={form.stars} onChange={(event) => setForm({ ...form, stars: event.target.value })} /></label>
                    <label>HP<input type="number" min="0" max="100" value={form.hp} onChange={(event) => setForm({ ...form, hp: event.target.value })} /></label>
                    <label className="check"><input type="checkbox" checked={form.isBanned} onChange={(event) => setForm({ ...form, isBanned: event.target.checked })} /> Banned</label>
                    <button><Save size={16} /> Save Ledger</button>
                  </form>
                  <div className="healthBox">
                    <div className="healthMeta"><span>Shovel HP</span><b>{form.hp}/100</b></div>
                    <div className="healthBar"><span style={{ width: `${Math.max(0, Math.min(100, Number(form.hp) || 0))}%` }} /></div>
                  </div>
                  <div className="workersGrid">
                    {(selected.shadows || []).slice(0, 8).map((worker, index) => (
                      <div className="workerCard" key={`${worker.name}-${index}`}>
                        <strong>{tierBalls[worker.level] || "⚫"} {worker.name}</strong>
                        <span>{worker.level} · {worker.power || 0} power · {worker.stars || 0} stars</span>
                      </div>
                    ))}
                  </div>
                  <label className="jsonEditor">
                    Worker JSON
                    <textarea value={form.shadows} onChange={(event) => setForm({ ...form, shadows: event.target.value })} />
                  </label>
                </>
              ) : (
                <div className="empty">Choose a player from the registry. Kim Dojka refuses to edit imaginary records.</div>
              )}
            </article>
          </section>
        )}

        {route === "health" && (
          <section className="contentGrid">
            <article className="panel">
              <div className="panelHead">
                <div>
                  <span className="kicker">Health</span>
                  <h2>Player health overview</h2>
                </div>
              </div>
              <div className="miniStats">
                <div><span>Users</span><b>{summary?.users ?? "-"}</b></div>
                <div><span>Banned</span><b>{summary?.bannedUsers ?? "-"}</b></div>
                <div><span>Healthy</span><b>{Array.isArray(users) ? users.filter((user) => Number(user.hp) >= 80).length : 0}</b></div>
                <div><span>At Risk</span><b>{lowHealthUsers.length}</b></div>
              </div>
              <div className="errorList">
                {lowHealthUsers.length ? lowHealthUsers.slice(0, 10).map((user) => (
                  <div className="errorItem" key={user.telegramId}>
                    <b>{user.firstName || user.telegramId}</b>
                    <span>{user.hp}/100 HP · {format(user.stars)} ⭐ Stars</span>
                    <small>@{user.username || "none"}</small>
                  </div>
                )) : <p>No low health workers detected.</p>}
              </div>
            </article>

            <article className="panel">
              <span className="kicker">Worker productivity</span>
              <h2>Estimated output</h2>
              <div className="errorList">
                <div className="errorItem">
                  <b>Current output estimate</b>
                   <span>{(Array.isArray(users) ? users.reduce((sum, user) => sum + ((user.incarnations || 0) * 5), 0) : 0)} Stars/hr</span>
                  <small>Projection based on worker counts and average tier output.</small>
                </div>
              </div>
            </article>
          </section>
        )}

        {route === "errors" && (
          <section className="panel">
            <div className="panelHead">
              <div>
                <span className="kicker">Error Ledger</span>
                <h2>Recent backend incidents</h2>
              </div>
            </div>
            <div className="errorList">
              {(summary?.recentErrors || []).length ? summary.recentErrors.map((err, index) => (
                <div className="errorItem" key={`${err.at}-${index}`}>
                  <b>{err.source}</b>
                  <span>{err.message}</span>
                  <small>{err.at}</small>
                </div>
              )) : <p>No incidents logged in the last 12 events.</p>}
            </div>
          </section>
        )}

        {route === "moderation" && (
          <section className="contentGrid">
            <article className="panel">
              <div className="panelHead">
                <div>
                  <span className="kicker">Moderation</span>
                  <h2>Banned and flagged accounts</h2>
                </div>
              </div>
              <div className="errorList">
                {bannedUsers.length ? bannedUsers.map((user) => (
                  <div className="errorItem" key={user.telegramId}>
                    <b>{user.firstName || user.telegramId}</b>
                    <span>{format(user.stars)} ⭐ Stars · {user.incarnations} incarnations</span>
                    <small>@{user.username || "none"}</small>
                  </div>
                )) : <p>No banned accounts at the moment.</p>}
              </div>
            </article>

            <article className="panel profilePanel">
              <div className="panelHead">
                <div>
                  <span className="kicker">Quick Ban Control</span>
                  <h2>{selected ? selected.firstName || selected.telegramId : "Select a player"}</h2>
                </div>
                {selected && <span className="pill">{selected.isBanned ? "Banned" : "Active"}</span>}
              </div>
              {selected ? (
                <form className="editor" onSubmit={saveUser}>
                  <label>Stars<input type="number" min="0" value={form.stars} onChange={(event) => setForm({ ...form, stars: event.target.value })} /></label>
                  <label>HP<input type="number" min="0" max="100" value={form.hp} onChange={(event) => setForm({ ...form, hp: event.target.value })} /></label>
                  <label className="check"><input type="checkbox" checked={form.isBanned} onChange={(event) => setForm({ ...form, isBanned: event.target.checked })} /> Banned</label>
                  <button><Save size={16} /> Save Ban Status</button>
                </form>
              ) : (
                <div className="empty">Pick a user on the Players page to review moderation status.</div>
              )}
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
