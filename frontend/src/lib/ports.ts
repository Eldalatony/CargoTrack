/** Ports the office ships between, as offered in the container forms. */
export const ORIGIN_PORTS = ["Ningbo", "Shanghai", "Shenzhen", "Guangzhou", "Qingdao"];
export const DESTINATION_PORTS = ["Alexandria", "Port Said", "Damietta", "Sokhna"];
export const TRANSIT_PORTS = ["Port Klang", "Colombo", "Salalah", "Jeddah", "Singapore"];

/** Container types and the capacity each typically holds. */
export const CONTAINER_TYPES = {
  "20GP": { label: "20GP · 20' general purpose", cbm: "33.2", kg: "28000" },
  "40GP": { label: "40GP · 40' general purpose", cbm: "67.7", kg: "28000" },
  "40HC": { label: "40HC · 40' high cube", cbm: "67.7", kg: "28000" },
} as const;

export type ContainerType = keyof typeof CONTAINER_TYPES;
