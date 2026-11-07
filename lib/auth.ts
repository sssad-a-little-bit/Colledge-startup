import { createHash } from "node:crypto";
import { compare } from "bcryptjs";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "./db";
import { AppError } from "./errors";

// A valid fixed hash makes nonexistent-account comparisons perform bcrypt work.
const DUMMY_HASH =
  "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
const MAX_ATTEMPTS = 10;
const LOCK_MS = 15 * 60 * 1000;

function checkAuthConfig() {
  if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length < 32) {
    throw new AppError(
      503,
      "Вход временно недоступен: требуется настройка сервера.",
      "AUTH_CONFIGURATION",
    );
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 4 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Вход в КИТ Campus",
      credentials: {
        email: { label: "Электронная почта", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        try {
          checkAuthConfig();
          const email = credentials?.email?.trim().toLowerCase() ?? "";
          const password = credentials?.password ?? "";
          if (
            !email ||
            email.length > 254 ||
            password.length < 1 ||
            Buffer.byteLength(password, "utf8") > 72
          )
            return null;
          const key = createHash("sha256")
            .update(`login:${email}`)
            .digest("hex");
          const now = new Date();
          // Persistent, atomic increment: parallel attempts cannot bypass a memory-only limiter.
          const allowed = await db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
            const previous = await tx.loginAttempt.findUnique({
              where: { key },
            });
            if (previous?.blockedUntil && previous.blockedUntil > now)
              return false;
            if (
              previous &&
              now.getTime() - previous.updatedAt.getTime() > LOCK_MS
            ) {
              await tx.loginAttempt.update({
                where: { key },
                data: { count: 0, blockedUntil: null },
              });
            }
            const attempt = await tx.loginAttempt.upsert({
              where: { key },
              create: { key, count: 1 },
              update: { count: { increment: 1 } },
            });
            if (attempt.count > MAX_ATTEMPTS) {
              await tx.loginAttempt.update({
                where: { key },
                data: { blockedUntil: new Date(now.getTime() + LOCK_MS) },
              });
              return false;
            }
            return true;
          });
          if (!allowed) return null;
          const user = await db.user.findUnique({ where: { email } });
          const correct = await compare(
            password,
            user?.passwordHash ?? DUMMY_HASH,
          );
          if (!correct || !user?.active) return null;
          await db.loginAttempt.update({
            where: { key },
            data: { count: 0, blockedUntil: null },
          });
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            canManageGrades: user.canManageGrades,
          };
        } catch {
          console.error(
            JSON.stringify({
              level: "error",
              source: "auth",
              code: "LOGIN_UNAVAILABLE",
              requestId: crypto.randomUUID(),
            }),
          );
          throw new Error("Вход временно недоступен. Повторите позже.");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Authorization attributes are deliberately absent: every request checks the DB.
      if (user) return { sub: user.id };
      return token;
    },
    async session({ session, token }) {
      const user = token.sub
        ? await db.user.findUnique({ where: { id: token.sub } })
        : null;
      if (!user?.active) {
        session.user = {
          id: "",
          name: "",
          email: "",
          role: "STUDENT",
          canManageGrades: false,
        };
        session.expires = new Date(0).toISOString();
        return session;
      }
      session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        canManageGrades: user.canManageGrades,
      };
      return session;
    },
  },
  logger: {
    error(code) {
      console.error(JSON.stringify({ level: "error", source: "auth", code }));
    },
    warn(code) {
      console.warn(JSON.stringify({ level: "warn", source: "auth", code }));
    },
    debug() {},
  },
};

export async function actor() {
  checkAuthConfig();
  // Probe before NextAuth: a callback DB failure must not masquerade as an expired session.
  await db.$queryRaw`SELECT 1`;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    throw new AppError(
      401,
      "Войдите в аккаунт, чтобы продолжить.",
      "UNAUTHENTICATED",
    );
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.active)
    throw new AppError(
      401,
      "Аккаунт отключён или сессия истекла. Войдите снова.",
      "SESSION_REVOKED",
    );
  return user;
}
