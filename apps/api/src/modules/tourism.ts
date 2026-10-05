import type { FastifyInstance } from "fastify";
import { authenticate } from "../http.js";

export type TourismArea = {
  name: string;
  lat: number;
  lng: number;
};

export type TourismCity = {
  name: string;
  lat: number;
  lng: number;
  areas: TourismArea[];
};

export const tourismCities: TourismCity[] = [
  {
    name: "Hurghada",
    lat: 27.2579,
    lng: 33.8116,
    areas: [
      { name: "El Mamsha", lat: 27.2374, lng: 33.8448 },
      { name: "Sahl Hasheesh", lat: 27.0468, lng: 33.8842 },
      { name: "El Gouna", lat: 27.3942, lng: 33.6782 },
      { name: "Makadi Bay", lat: 26.9936, lng: 33.8996 },
      { name: "Downtown Hurghada", lat: 27.2574, lng: 33.8129 },
      { name: "Sheraton Road", lat: 27.2236, lng: 33.8411 },
      { name: "New Marina", lat: 27.1908, lng: 33.8415 },
      { name: "El Kawther", lat: 27.1804, lng: 33.8256 },
      { name: "Magawish", lat: 27.1618, lng: 33.8332 },
      { name: "Villages Road", lat: 27.2041, lng: 33.8374 },
    ],
  },
  {
    name: "Sharm El Sheikh",
    lat: 27.9158,
    lng: 34.33,
    areas: [
      { name: "Naama Bay", lat: 27.9134, lng: 34.3278 },
      { name: "Nabq Bay", lat: 28.0462, lng: 34.4291 },
      { name: "Sharks Bay", lat: 27.9622, lng: 34.3948 },
      { name: "Hadaba", lat: 27.8686, lng: 34.3018 },
      { name: "Old Market", lat: 27.8578, lng: 34.2944 },
      { name: "Ras Um Sid", lat: 27.8472, lng: 34.3164 },
      { name: "Montazah", lat: 27.8708, lng: 34.3062 },
      { name: "Peace Road", lat: 27.8894, lng: 34.3168 },
    ],
  },
  {
    name: "Dahab",
    lat: 28.5091,
    lng: 34.5136,
    areas: [
      { name: "Mashraba", lat: 28.4928, lng: 34.5174 },
      { name: "Assalah", lat: 28.5086, lng: 34.5171 },
      { name: "Lighthouse", lat: 28.4956, lng: 34.5218 },
      { name: "Laguna", lat: 28.4864, lng: 34.5062 },
      { name: "Blue Hole Road", lat: 28.5718, lng: 34.5386 },
    ],
  },
  {
    name: "Taba",
    lat: 29.4917,
    lng: 34.8969,
    areas: [
      { name: "Taba Heights", lat: 29.3968, lng: 34.8092 },
      { name: "Taba Bay", lat: 29.4924, lng: 34.8961 },
      { name: "Nuweiba Road", lat: 29.3524, lng: 34.7468 },
    ],
  },
  {
    name: "Nuweiba",
    lat: 29.0336,
    lng: 34.6628,
    areas: [
      { name: "Nuweiba Port", lat: 29.0358, lng: 34.6664 },
      { name: "Tarabin", lat: 29.0478, lng: 34.6712 },
      { name: "Mazraa", lat: 29.0214, lng: 34.6586 },
    ],
  },
  {
    name: "Ain Sokhna",
    lat: 29.6002,
    lng: 32.3166,
    areas: [
      { name: "Porto Sokhna", lat: 29.6238, lng: 32.3348 },
      { name: "Stella Di Mare", lat: 29.6524, lng: 32.3462 },
      { name: "La Vista", lat: 29.5486, lng: 32.3518 },
      { name: "Telal Sokhna", lat: 29.5862, lng: 32.3284 },
    ],
  },
  {
    name: "El Alamein",
    lat: 30.8333,
    lng: 28.95,
    areas: [
      { name: "Marina El Alamein", lat: 30.8486, lng: 28.9548 },
      { name: "New Alamein", lat: 30.8324, lng: 28.9186 },
      { name: "Telal El Alamein", lat: 30.8412, lng: 28.9364 },
    ],
  },
  {
    name: "Marsa Alam",
    lat: 25.068,
    lng: 34.892,
    areas: [
      { name: "Port Ghalib", lat: 25.5358, lng: 34.6408 },
      { name: "Abu Dabbab", lat: 25.3396, lng: 34.7428 },
      { name: "El Quseir Road", lat: 25.1186, lng: 34.8842 },
      { name: "Downtown Marsa Alam", lat: 25.0674, lng: 34.8916 },
    ],
  },
  {
    name: "El Quseir",
    lat: 26.1043,
    lng: 34.2778,
    areas: [
      { name: "Old Town", lat: 26.1048, lng: 34.2824 },
      { name: "Mangrove Bay", lat: 26.1864, lng: 34.2086 },
      { name: "Safaga Road", lat: 26.1482, lng: 34.2418 },
    ],
  },
  {
    name: "Safaga",
    lat: 26.7491,
    lng: 33.9361,
    areas: [
      { name: "Downtown Safaga", lat: 26.7496, lng: 33.9368 },
      { name: "Soma Bay", lat: 26.8468, lng: 33.9864 },
      { name: "Port Safaga", lat: 26.7384, lng: 33.9412 },
    ],
  },
  {
    name: "Luxor",
    lat: 25.6872,
    lng: 32.6396,
    areas: [
      { name: "East Bank", lat: 25.6996, lng: 32.6424 },
      { name: "West Bank", lat: 25.6998, lng: 32.6078 },
      { name: "Karnak", lat: 25.7186, lng: 32.6574 },
      { name: "Corniche", lat: 25.6954, lng: 32.6398 },
    ],
  },
  {
    name: "Aswan",
    lat: 24.0889,
    lng: 32.8998,
    areas: [
      { name: "Corniche", lat: 24.0908, lng: 32.8992 },
      { name: "Elephantine", lat: 24.0854, lng: 32.8876 },
      { name: "Gharb Aswan", lat: 24.0918, lng: 32.8714 },
      { name: "New Aswan", lat: 24.1126, lng: 32.9128 },
    ],
  },
  {
    name: "Cairo",
    lat: 30.0444,
    lng: 31.2357,
    areas: [
      { name: "Zamalek", lat: 30.0626, lng: 31.2196 },
      { name: "Downtown Cairo", lat: 30.0478, lng: 31.2396 },
      { name: "Garden City", lat: 30.0368, lng: 31.2318 },
      { name: "Heliopolis", lat: 30.0876, lng: 31.3248 },
      { name: "Nasr City", lat: 30.0564, lng: 31.3308 },
      { name: "Maadi", lat: 29.9602, lng: 31.2568 },
      { name: "New Cairo", lat: 30.0318, lng: 31.4756 },
      { name: "6th of October", lat: 29.9724, lng: 30.9446 },
      { name: "Giza Pyramids", lat: 29.9773, lng: 31.1325 },
    ],
  },
  {
    name: "Alexandria",
    lat: 31.2001,
    lng: 29.9187,
    areas: [
      { name: "Corniche", lat: 31.2136, lng: 29.9184 },
      { name: "Stanley", lat: 31.2358, lng: 29.9506 },
      { name: "Gleem", lat: 31.2418, lng: 29.9612 },
      { name: "Montaza", lat: 31.2886, lng: 30.0158 },
      { name: "Miami", lat: 31.2664, lng: 29.9864 },
      { name: "San Stefano", lat: 31.2452, lng: 29.9668 },
      { name: "Downtown Alexandria", lat: 31.1996, lng: 29.8948 },
    ],
  },
  {
    name: "Marsa Matrouh",
    lat: 31.3529,
    lng: 27.2373,
    areas: [
      { name: "Downtown Matrouh", lat: 31.3524, lng: 27.2378 },
      { name: "Rommel Beach", lat: 31.3618, lng: 27.2214 },
      { name: "Cleopatra Beach", lat: 31.3686, lng: 27.2018 },
    ],
  },
  {
    name: "Siwa",
    lat: 29.2032,
    lng: 25.5195,
    areas: [
      { name: "Siwa Town", lat: 29.2036, lng: 25.5198 },
      { name: "Shali", lat: 29.2058, lng: 25.5174 },
      { name: "Fatnas Island", lat: 29.1968, lng: 25.4986 },
    ],
  },
  {
    name: "Fayoum",
    lat: 29.3084,
    lng: 30.8428,
    areas: [
      { name: "Tunis Village", lat: 29.3968, lng: 30.4896 },
      { name: "Lake Qarun", lat: 29.4536, lng: 30.5784 },
      { name: "Wadi El Rayan", lat: 29.2058, lng: 30.4218 },
    ],
  },
  {
    name: "Ras Sudr",
    lat: 29.5918,
    lng: 32.7164,
    areas: [
      { name: "Downtown Ras Sudr", lat: 29.5914, lng: 32.7168 },
      { name: "Moon Beach", lat: 29.5486, lng: 32.6984 },
      { name: "Palm Beach", lat: 29.6238, lng: 32.7312 },
    ],
  },
];

export function findTourismCity(name: string) {
  return tourismCities.find((city) => city.name === name);
}

export function findTourismArea(cityName: string, areaName: string) {
  return findTourismCity(cityName)?.areas.find((area) => area.name === areaName);
}

export function registerTourism(app: FastifyInstance) {
  app.get("/api/tourism/cities", { preHandler: authenticate }, async () => tourismCities);
}
