const path = require("path");
const express = require("express");
const { query, withTransaction, initDb } = require("./src/db");
const {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  requireAuth
} = require("./src/auth");
const {
  seedAiClubs,
  seedMarket,
  createClubWithRoster,
  clubForUser,
  computeClubRating,
  playMatch
} = require("./src/game");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || ""));
}

app.get("/health", async (_req, res, next) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const email = cleanEmail(req.body.email);
    const password = String(req.body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Informe um e-mail válido." });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: "A senha deve ter entre 6 e 128 caracteres." });
    }

    const { salt, hash } = hashPassword(password);
    const result = await query(
      `INSERT INTO users(email, password_hash, password_salt)
       VALUES($1,$2,$3) RETURNING id, email`,
      [email, hash, salt]
    );
    setSessionCookie(res, result.rows[0].id);
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Este e-mail já está cadastrado." });
    next(err);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = cleanEmail(req.body.email);
    const password = String(req.body.password || "");
    const result = await query("SELECT * FROM users WHERE email = $1", [email]);
    if (!result.rowCount || !verifyPassword(password, result.rows[0].password_salt, result.rows[0].password_hash)) {
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    }
    setSessionCookie(res, result.rows[0].id);
    res.json({ user: { id: result.rows[0].id, email: result.rows[0].email } });
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, async (req, res, next) => {
  try {
    const club = await clubForUser(req.user.id);
    res.json({ user: req.user, club });
  } catch (err) {
    next(err);
  }
});

app.post("/api/club", requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim().replace(/\s+/g, " ");
    const primaryColor = String(req.body.primaryColor || "#153e75");
    const secondaryColor = String(req.body.secondaryColor || "#f7fafc");

    if (name.length < 3 || name.length > 30) {
      return res.status(400).json({ error: "O nome deve ter entre 3 e 30 caracteres." });
    }
    if (!validColor(primaryColor) || !validColor(secondaryColor)) {
      return res.status(400).json({ error: "Cores inválidas." });
    }

    const club = await createClubWithRoster(req.user.id, { name, primaryColor, secondaryColor });
    res.status(201).json({ club });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Este nome de clube já está em uso." });
    next(err);
  }
});

app.get("/api/club", requireAuth, async (req, res, next) => {
  try {
    const club = await clubForUser(req.user.id);
    if (!club) return res.status(404).json({ error: "Clube não encontrado." });
    const rating = await computeClubRating(club.id);
    res.json({ club: { ...club, team_rating: rating } });
  } catch (err) {
    next(err);
  }
});

app.get("/api/players", requireAuth, async (req, res, next) => {
  try {
    const club = await clubForUser(req.user.id);
    if (!club) return res.status(404).json({ error: "Crie seu clube primeiro." });
    const result = await query(
      `SELECT * FROM players WHERE club_id = $1
       ORDER BY is_starter DESC,
       CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END,
       rating DESC`,
      [club.id]
    );
    res.json({ players: result.rows });
  } catch (err) {
    next(err);
  }
});

app.put("/api/lineup", requireAuth, async (req, res, next) => {
  try {
    const club = await clubForUser(req.user.id);
    if (!club) return res.status(404).json({ error: "Crie seu clube primeiro." });

    const starterIds = Array.isArray(req.body.starterIds) ? req.body.starterIds.map(String) : [];
    const formation = String(req.body.formation || "4-3-3");
    const allowedFormations = ["4-3-3", "4-4-2", "3-5-2"];

    if (starterIds.length !== 11 || new Set(starterIds).size !== 11) {
      return res.status(400).json({ error: "Selecione exatamente 11 titulares." });
    }
    if (!allowedFormations.includes(formation)) {
      return res.status(400).json({ error: "Formação inválida." });
    }

    const owned = await query(
      `SELECT id, position FROM players WHERE club_id = $1 AND id = ANY($2::bigint[])`,
      [club.id, starterIds]
    );
    if (owned.rowCount !== 11) return res.status(400).json({ error: "Há jogador inválido na escalação." });
    if (!owned.rows.some(p => p.position === "GK")) {
      return res.status(400).json({ error: "Selecione pelo menos um goleiro." });
    }

    await withTransaction(async client => {
      await client.query("UPDATE players SET is_starter = FALSE WHERE club_id = $1", [club.id]);
      await client.query(
        "UPDATE players SET is_starter = TRUE WHERE club_id = $1 AND id = ANY($2::bigint[])",
        [club.id, starterIds]
      );
      await client.query("UPDATE clubs SET formation = $2 WHERE id = $1", [club.id, formation]);
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/market", requireAuth, async (_req, res, next) => {
  try {
    await seedMarket(30);
    const result = await query(
      `SELECT * FROM players WHERE club_id IS NULL
       ORDER BY rating DESC, price DESC LIMIT 30`
    );
    res.json({ players: result.rows });
  } catch (err) {
    next(err);
  }
});

app.post("/api/market/buy", requireAuth, async (req, res, next) => {
  try {
    const playerId = String(req.body.playerId || "");
    const club = await clubForUser(req.user.id);
    if (!club) return res.status(404).json({ error: "Crie seu clube primeiro." });

    const bought = await withTransaction(async client => {
      const p = await client.query(
        "SELECT * FROM players WHERE id = $1 AND club_id IS NULL FOR UPDATE",
        [playerId]
      );
      if (!p.rowCount) throw Object.assign(new Error("Jogador não está mais disponível."), { status: 409 });

      const c = await client.query("SELECT coins FROM clubs WHERE id = $1 FOR UPDATE", [club.id]);
      if (c.rows[0].coins < p.rows[0].price) {
        throw Object.assign(new Error("Moedas insuficientes."), { status: 400 });
      }

      await client.query("UPDATE clubs SET coins = coins - $2 WHERE id = $1", [club.id, p.rows[0].price]);
      await client.query("UPDATE players SET club_id = $2, is_starter = FALSE WHERE id = $1", [playerId, club.id]);
      return p.rows[0];
    });

    await seedMarket(30);
    res.json({ player: bought });
  } catch (err) {
    next(err);
  }
});

app.post("/api/matches/play", requireAuth, async (req, res, next) => {
  try {
    const match = await playMatch(req.user.id);
    res.json({ match });
  } catch (err) {
    next(err);
  }
});

app.get("/api/matches", requireAuth, async (req, res, next) => {
  try {
    const club = await clubForUser(req.user.id);
    if (!club) return res.status(404).json({ error: "Crie seu clube primeiro." });

    const result = await query(
      `SELECT m.*, c.name AS opponent_name
       FROM matches m
       JOIN clubs c ON c.id = m.opponent_club_id
       WHERE m.user_club_id = $1
       ORDER BY m.played_at DESC LIMIT 20`,
      [club.id]
    );
    res.json({ matches: result.rows });
  } catch (err) {
    next(err);
  }
});

app.get("/api/standings", requireAuth, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, points, wins, draws, losses, goals_for, goals_against,
              (goals_for - goals_against) AS goal_difference, team_rating, is_ai
       FROM clubs
       ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC, name ASC
       LIMIT 30`
    );
    res.json({ standings: result.rows });
  } catch (err) {
    next(err);
  }
});

app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = Number(err.status || 500);
  res.status(status).json({
    error: status >= 500 ? "Erro interno do servidor." : err.message
  });
});

async function start() {
  await initDb();
  await seedAiClubs();
  await seedMarket(30);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Dono do Clube rodando na porta ${PORT}`);
  });
}

start().catch(err => {
  console.error("Falha ao iniciar:", err);
  process.exit(1);
});
