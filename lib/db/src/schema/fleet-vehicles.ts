import { pgTable, serial, varchar, integer, timestamp, index, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Fleet Operator vehicles for rental.
 *
 * Orgs with Fleet Operator service type can register up to 5 vehicles.
 * Players walk to the pickup pin, press [E], pay upfront for 1-4 hrs.
 * Vehicle confers a speed boost for the rental duration. Timer runs
 * server-side; a cron every 2 min expires overdue rentals and credits
 * the org checking account.
 *
 * Vehicle types: cargo_van | courier_bike | armored_transport | off_road_rover | boat
 * Speed multipliers: courier_bike=1.4, off_road_rover=1.3, cargo_van=1.2,
 *                   armored_transport=1.1, boat=1.25
 */
export const fleetVehiclesTable = pgTable("fleet_vehicles", {
  id: serial("id").primaryKey(),

  orgId: integer("org_id").notNull(),
  orgName: varchar("org_name", { length: 128 }).notNull().default(""),

  vehicleType: varchar("vehicle_type", { length: 32 }).notNull().default("cargo_van"),
  name: varchar("name", { length: 64 }).notNull(),
  rateFiatPerHr: integer("rate_fiat_per_hr").notNull().default(100),

  // World map pickup pin
  pickupX: real("pickup_x").notNull().default(0),
  pickupY: real("pickup_y").notNull().default(0),
  cityId: varchar("city_id", { length: 32 }).notNull().default("minx_prime"),

  // Current rental state
  currentRenterUserId: varchar("current_renter_user_id", { length: 64 }),
  currentRenterName: varchar("current_renter_name", { length: 64 }),
  rentalStartedAt: timestamp("rental_started_at", { withTimezone: true }),
  rentalEndsAt: timestamp("rental_ends_at", { withTimezone: true }),
  rentalHours: integer("rental_hours"), // how many hours paid upfront
  rentalPaidFiat: integer("rental_paid_fiat"), // total upfront payment

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byOrg: index("fleet_org_idx").on(t.orgId),
  byCity: index("fleet_city_idx").on(t.cityId),
  byRenter: index("fleet_renter_idx").on(t.currentRenterUserId),
}));

export const insertFleetVehicleSchema = createInsertSchema(fleetVehiclesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertFleetVehicle = z.infer<typeof insertFleetVehicleSchema>;
export type FleetVehicle = typeof fleetVehiclesTable.$inferSelect;
