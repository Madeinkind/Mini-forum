// src/MiniForumFirebase.jsx
import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";

import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

// Tailwind-based UI with modal (Registration / Login)
export default function MiniForumFirebase() {
  // auth & data
  const [user, setUser] = useState(null);
  const [threads, setThreads] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [posts, setPosts] = useState([]);

  // modal / auth UI
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // forms
  const [regData, setRegData] = useState({ username: "", email: "", password: "", confirm: "" });
  const [loginData, setLoginData] = useState({ email: "", password: "" });

  // thread/post forms
  const [threadTitle, setThreadTitle] = useState("");
  const [replyText, setReplyText] = useState("");

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u);
      else setUser(null);
    });
    return () => unsub();
  }, []);

  // Subscribe to threads (real-time)
  useEffect(() => {
    setLoadingThreads(true);
    const col = collection(db, "threads");
    const q = query(col, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setThreads(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingThreads(false);
      },
      (err) => {
        console.error("threads snapshot error:", err);
        setLoadingThreads(false);
      }
    );
    return () => unsub();
  }, []);

  // Subscribe to posts for active thread
  useEffect(() => {
    if (!activeThreadId) {
      setPosts([]);
      return;
    }
    const postsCol = collection(db, `threads/${activeThreadId}/posts`);
    const q = query(postsCol, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("posts snapshot error:", err)
    );
    return () => unsub();
  }, [activeThreadId]);

  // Helpers
  function shortErr(e) {
    if (!e) return "Ошибка";
    if (e.code) return e.code.replace("auth/", "").replace(/-/g, " ");
    return String(e.message || e);
  }

  // -------- Auth handlers (modal) --------
  async function handleRegister(e) {
    e?.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    const username = regData.username.trim();
    const email = regData.email.trim();
    const password = regData.password;
    const confirm = regData.confirm;

    if (!username || !email || !password || !confirm) {
      setError("Заполните все поля");
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError("Пароль минимум 6 символов");
      setLoading(false);
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают");
      setLoading(false);
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: username });
      await setDoc(doc(db, "users", cred.user.uid), {
        displayName: username,
        email,
        createdAt: serverTimestamp(),
      });
      setInfo("Регистрация успешна");
      setAuthOpen(false);
      setRegData({ username: "", email: "", password: "", confirm: "" });
    } catch (err) {
      setError(shortErr(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e?.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    const email = loginData.email.trim();
    const password = loginData.password;
    if (!email || !password) {
      setError("Заполните email и пароль");
      setLoading(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setInfo("Вход успешен");
      setAuthOpen(false);
      setLoginData({ email: "", password: "" });
    } catch (err) {
      setError(shortErr(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      setInfo("Выход выполнен");
    } catch (err) {
      console.error(err);
    }
  }

  // -------- Threads & posts --------
  async function createThread(e) {
    e?.preventDefault();
    setError(""); setInfo("");
    if (!user) { setError("Нужно войти чтобы создать тему"); return; }
    const title = threadTitle.trim();
    if (!title) { setError("Введите название темы"); return; }
    try {
      const ref = await addDoc(collection(db, "threads"), {
        title,
        authorId: user.uid,
        authorName: user.displayName || user.email,
        createdAt: serverTimestamp(),
        lastAt: serverTimestamp()
      });
      setThreadTitle("");
      setActiveThreadId(ref.id);
      setInfo("Тема создана");
    } catch (err) {
      setError("Ошибка создания темы");
      console.error(err);
    }
  }

  async function addPost(e) {
    e?.preventDefault();
    setError(""); setInfo("");
    if (!user) { setError("Нужно войти чтобы ответить"); return; }
    if (!activeThreadId) { setError("Выберите тему"); return; }
    const text = replyText.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, `threads/${activeThreadId}/posts`), {
        text,
        authorId: user.uid,
        authorName: user.displayName || user.email,
        createdAt: serverTimestamp()
      });
      // update thread lastAt
      await updateDoc(doc(db, "threads", activeThreadId), { lastAt: serverTimestamp() });
      setReplyText("");
      setInfo("Сообщение отправлено");
    } catch (err) {
      setError("Ошибка отправки");
      console.error(err);
    }
  }

  async function deleteThread(thread) {
    if (!user) { setError("Нужно войти"); return; }
    if (thread.authorId !== user.uid) { setError("Только автор может удалить тему"); return; }
    if (!confirm("Удалить тему?")) return;
    try {
      await deleteDoc(doc(db, "threads", thread.id));
      setActiveThreadId(null);
      setInfo("Тема удалена");
    } catch (err) {
      setError("Ошибка удаления");
      console.error(err);
    }
  }
  
  // Удалить пост (комментарий) в активной теме
async function deletePost(post) {
  if (!user) { setError("Нужно войти"); return; }
  if (post.authorId !== user.uid) { setError("Только автор может удалить этот комментарий"); return; }
  if (!confirm("Удалить этот комментарий?")) return;

  try {
    // путь к документу поста: threads/{threadId}/posts/{postId}
    await deleteDoc(doc(db, `threads/${activeThreadId}/posts/${post.id}`));
    setInfo("Комментарий удалён");
  } catch (err) {
    console.error(err);
    setError("Ошибка удаления комментария");
  }
}


  // format timestamp (Firestore Timestamp -> js Date)
  function fmtTs(ts) {
    try {
      if (!ts) return "";
      if (ts.toDate) return ts.toDate().toLocaleString();
      return new Date(ts).toLocaleString();
    } catch {
      return "";
    }
  }

  const currentUserName = user ? (user.displayName || user.email) : null;

  // -------- RENDER --------
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="max-w-5xl mx-auto flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded flex items-center justify-center text-white font-bold">F</div>
          <h1 className="text-xl font-semibold">MiniForum</h1>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="text-sm">Привет, <strong>{currentUserName}</strong></div>
              <button onClick={handleLogout} className="px-3 py-1 bg-red-100 text-red-700 rounded">Выйти</button>
            </>
          ) : (
            <>
              <button onClick={() => { setMode("login"); setAuthOpen(true); setError(""); setInfo(""); }} className="px-3 py-1 border rounded">Войти</button>
              <button onClick={() => { setMode("register"); setAuthOpen(true); setError(""); setInfo(""); }} className="px-3 py-1 bg-indigo-600 text-white rounded">Регистрация</button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
        <section className="md:col-span-2 bg-white rounded shadow p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Темы</h2>
            <form onSubmit={createThread} className="flex gap-2 items-center">
              <input value={threadTitle} onChange={e=>setThreadTitle(e.target.value)} placeholder="Новая тема" className="p-2 border rounded" />
              <button className="px-3 py-1 bg-indigo-600 text-white rounded">Создать</button>
            </form>
          </div>

          {loadingThreads ? (
            <div>Загрузка...</div>
          ) : (
            <ul className="space-y-3">
              {threads.map(t => (
                <li key={t.id} className="p-3 border rounded hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="cursor-pointer" onClick={() => setActiveThreadId(t.id)}>
                      <h3 className="font-medium">{t.title}</h3>
                      <div className="text-xs text-gray-500">Автор: {t.authorName} • {fmtTs(t.createdAt)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-sm text-gray-400">{t.lastAt ? fmtTs(t.lastAt) : ""}</div>
                      {user && t.authorId === user.uid && (
                        <button onClick={() => deleteThread(t)} className="text-xs text-red-600">Удалить</button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="bg-white rounded shadow p-4">
          <h3 className="font-medium">Профиль</h3>

          {!user ? (
            <div className="mt-3 text-sm text-gray-500">Вы не вошли. Зарегистрируйтесь или войдите через кнопку в шапке.</div>
          ) : (
            <div className="mt-3">
              <div className="font-medium">{currentUserName}</div>
              <div className="text-sm text-gray-500">UID: {user.uid}</div>
            </div>
          )}

          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          {info && <div className="mt-3 text-sm text-green-600">{info}</div>}
        </aside>

        {/* posts area full width */}
        <section className="md:col-span-3 bg-white rounded shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Тема</h3>
            <div>
              <button onClick={() => { setActiveThreadId(null); setPosts([]); }} className="px-3 py-1 border rounded">Сброс</button>
            </div>
          </div>

          {!activeThreadId ? (
            <div className="text-sm text-gray-500">Выберите тему, чтобы увидеть сообщения</div>
          ) : (
            <>
              <div className="mb-4">
                <h4 className="text-lg font-semibold">{threads.find(t=>t.id===activeThreadId)?.title}</h4>
              </div>

              {posts.length === 0 ? (
                <div className="text-gray-500">Пока нет сообщений.</div>
              ) : (
                <div className="space-y-1">
                  {posts.map(p => (
                    <div key={p.id} className="p-3 border rounded">
                      <div className="text-sm font-medium">{p.authorName}</div>
                      <div className="mt-1">{p.text}</div>
                      <div className="text-xs text-gray-400 mt-1 flex justify-between items-center">
                        <span>{fmtTs(p.createdAt)}</span>
                        {user && p.authorId === user.uid && (
                          <button
                            onClick={() => deletePost(p)}
                            className="text-xs text-red-600 hover:underline"
                            aria-label="Удалить комментарий"
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}





              <form onSubmit={addPost} className="space-y-2 mt-4">
                <textarea value={replyText} onChange={e=>setReplyText(e.target.value)} className="w-full p-2 border rounded" rows={4} placeholder="Написать ответ..." />
                <div className="flex gap-2">
                  <button className="px-3 py-1 bg-indigo-600 text-white rounded">{user ? "Отправить" : "Требуется вход"}</button>
                  <button type="button" onClick={()=>setReplyText("")} className="px-3 py-1 border rounded">Очистить</button>
                </div>
              </form>
            </>
          )}
        </section>
      </main>

      {/* Auth modal */}
      {authOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">{mode === "login" ? "Вход" : "Регистрация"}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setInfo(""); }} className="text-sm text-indigo-600">
                  {mode === "login" ? "Регистрация" : "Вход"}
                </button>
                <button onClick={() => { setAuthOpen(false); setError(""); setInfo(""); }} className="text-sm text-gray-500">Закрыть</button>
              </div>
            </div>

            {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
            {info && <div className="mb-3 text-sm text-green-600">{info}</div>}

            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-3">
                <input placeholder="Email" value={loginData.email} onChange={e=>setLoginData({...loginData, email:e.target.value})} className="w-full p-2 border rounded" />
                <input placeholder="Пароль" type="password" value={loginData.password} onChange={e=>setLoginData({...loginData, password:e.target.value})} className="w-full p-2 border rounded" />
                <div className="flex justify-end">
                  <button type="submit" disabled={loading} className="px-3 py-1 bg-indigo-600 text-white rounded">{loading ? "Входим..." : "Войти"}</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                <input placeholder="Имя" value={regData.username} onChange={e=>setRegData({...regData, username:e.target.value})} className="w-full p-2 border rounded" />
                <input placeholder="Email" value={regData.email} onChange={e=>setRegData({...regData, email:e.target.value})} className="w-full p-2 border rounded" />
                <input placeholder="Пароль" type="password" value={regData.password} onChange={e=>setRegData({...regData, password:e.target.value})} className="w-full p-2 border rounded" />
                <input placeholder="Подтвердите пароль" type="password" value={regData.confirm} onChange={e=>setRegData({...regData, confirm:e.target.value})} className="w-full p-2 border rounded" />
                <div className="flex justify-end">
                  <button type="submit" disabled={loading} className="px-3 py-1 bg-indigo-600 text-white rounded">{loading ? "Регистрируем..." : "Зарегистрироваться"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      <footer className="mt-10 border-t pt-4 text-center text-sm text-gray-500">
        <p>
          © {new Date().getFullYear()} MiniForum — учебный проект. Сделано на{" "}
          <span className="font-medium text-indigo-600">React + Firebase</span>.
        </p>
        <p className="mt-1">
          Автор: <span className="text-gray-700 font-medium">Данил Палагута</span>
        </p>
      </footer>

    </div>
  );
}
