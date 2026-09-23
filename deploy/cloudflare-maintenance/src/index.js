export default {
  async fetch() {
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_controller, env) {
    if (!env.MAINTENANCE_TOKEN) {
      throw new Error("MAINTENANCE_TOKEN secret is missing");
    }

    const response = await fetch(
      "https://webmuonphong.onrender.com/internal/maintenance/",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.MAINTENANCE_TOKEN}` },
        signal: AbortSignal.timeout(180_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Booking maintenance failed: HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log(`Booking maintenance: expired=${result.expired}, completed=${result.completed}`);
  },
};
