export function getISTTimeData() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );

  const hour = now.getHours();

  let time_of_day;
  if (hour < 6) time_of_day = "night";
  else if (hour < 12) time_of_day = "morning";
  else if (hour < 17) time_of_day = "afternoon";
  else time_of_day = "evening";

  const time = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });

  return { hour, time, time_of_day };
}