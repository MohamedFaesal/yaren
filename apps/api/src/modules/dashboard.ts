import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { authenticate, roles, userTypes } from "../http.js";
import { loadAccess, viewWhere } from "../permissions.js";

export function registerDashboard(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/dashboard", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    const usersWhere = viewWhere(access, request.user.sub, "user", { owner: "created_by" });
    const userParams = usersWhere.sql === "TRUE" ? [] : [...usersWhere.params, request.user.sub];
    const userSql = usersWhere.sql === "TRUE" ? "TRUE" : `(${usersWhere.sql} OR id = $${userParams.length})`;
    const hotelsWhere = viewWhere(access, request.user.sub, "hotel", { owner: "added_by" });
    const clinicsWhere = viewWhere(access, request.user.sub, "clinic", { owner: "c.added_by", clinic: "c.id" });
    const [users, types, roleRows, hotels, cities, clinics, clinicCities, covered, recentUsers, recentHotels, recentClinics] = await Promise.all([
      pool.query<{ total: number; active: number; inactive: number }>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE is_active)::int AS active,
                count(*) FILTER (WHERE NOT is_active)::int AS inactive
         FROM users WHERE deleted_at IS NULL AND ${userSql}`,
        userParams,
      ),
      pool.query<{ key: string; count: number }>(
        `SELECT type AS key, count(*)::int AS count FROM users WHERE deleted_at IS NULL AND ${userSql} GROUP BY type`,
        userParams,
      ),
      pool.query<{ key: string; count: number }>(
        `SELECT role AS key, count(*)::int AS count FROM users WHERE deleted_at IS NULL AND ${userSql} GROUP BY role`,
        userParams,
      ),
      pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM hotels WHERE deleted_at IS NULL AND ${hotelsWhere.sql}`, hotelsWhere.params),
      pool.query<{ city: string; count: number }>(
        `SELECT location->>'city' AS city, count(*)::int AS count
         FROM hotels WHERE deleted_at IS NULL AND ${hotelsWhere.sql}
         GROUP BY 1 ORDER BY count DESC, city`,
        hotelsWhere.params,
      ),
      pool.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM clinics c WHERE c.deleted_at IS NULL AND ${clinicsWhere.sql}`,
        clinicsWhere.params,
      ),
      pool.query<{ city: string; count: number }>(
        `SELECT h.location->>'city' AS city, count(*)::int AS count
         FROM clinics c JOIN hotels h ON h.id = c.hotel_id
         WHERE c.deleted_at IS NULL AND h.deleted_at IS NULL AND ${clinicsWhere.sql}
         GROUP BY 1 ORDER BY count DESC, city`,
        clinicsWhere.params,
      ),
      pool.query<{ total: number }>(
        `SELECT count(DISTINCT c.hotel_id)::int AS total
         FROM clinics c JOIN hotels h ON h.id = c.hotel_id
         WHERE c.deleted_at IS NULL AND h.deleted_at IS NULL AND ${clinicsWhere.sql}`,
        clinicsWhere.params,
      ),
      pool.query<{ kind: "user"; id: string; name: string; created_at: Date }>(
        `SELECT 'user' AS kind, id, name, created_at FROM users WHERE deleted_at IS NULL AND ${userSql} ORDER BY created_at DESC LIMIT 6`,
        userParams,
      ),
      pool.query<{ kind: "hotel"; id: string; name: string; created_at: Date }>(
        `SELECT 'hotel' AS kind, id, name, created_at FROM hotels WHERE deleted_at IS NULL AND ${hotelsWhere.sql} ORDER BY created_at DESC LIMIT 6`,
        hotelsWhere.params,
      ),
      pool.query<{ kind: "clinic"; id: string; name: string; created_at: Date }>(
        `SELECT 'clinic' AS kind, c.id, c.name, c.created_at FROM clinics c WHERE c.deleted_at IS NULL AND ${clinicsWhere.sql} ORDER BY c.created_at DESC LIMIT 6`,
        clinicsWhere.params,
      ),
    ]);

    const summary = users.rows[0] ?? { total: 0, active: 0, inactive: 0 };
    const recent = [...recentUsers.rows, ...recentHotels.rows, ...recentClinics.rows]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, 6);
    return {
      users: {
        total: summary.total,
        active: summary.active,
        inactive: summary.inactive,
        by_type: fill(userTypes, types.rows),
        by_role: fill(roles, roleRows.rows),
      },
      hotels: {
        total: hotels.rows[0]?.total ?? 0,
        with_clinics: covered.rows[0]?.total ?? 0,
        by_city: cities.rows,
      },
      clinics: {
        total: clinics.rows[0]?.total ?? 0,
        by_city: clinicCities.rows,
      },
      recent,
    };
  });
}

function fill(order: readonly string[], rows: { key: string; count: number }[]) {
  const counts = new Map(rows.map((row) => [row.key, row.count]));
  return order.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}
