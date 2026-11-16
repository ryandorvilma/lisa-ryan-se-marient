import { Router } from "express";

export const calendarRouter = Router();

function formatICSDate(iso) {
  return iso.replace(/[-:]/g, "").split(".")[0] + "Z";
}

calendarRouter.get("/calendar.ics", (_req, res) => {
  const start = new Date("2027-07-31T14:30:00Z"); // 16h30 Paris (UTC+2)
  const end = new Date("2027-07-31T22:30:00Z"); // 00h30 Paris (UTC+2)

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lisa & Ryan//Mariage//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:lisa-ryan-mariage-2027@lisa-ryan-se-marient.fr`,
    `DTSTAMP:${formatICSDate(new Date().toISOString())}`,
    `DTSTART:${formatICSDate(start.toISOString())}`,
    `DTEND:${formatICSDate(end.toISOString())}`,
    "SUMMARY:Mariage de Lisa & Ryan",
    "DESCRIPTION:Cérémonie 16h30 (Église de Champcueil)\\, vin d'honneur 18h\\, dîner 19h30.",
    "LOCATION:Château de Nainville-les-Roches\\, 91750 Nainville-les-Roches",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="mariage-lisa-ryan.ics"');
  res.send(ics);
});
