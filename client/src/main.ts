type HealthResponse = {
    status: string;
    version: string;
    uptime: number;
    timestamp: number;
};

const dot = document.getElementById("dot");
const text = document.getElementById("status-text");

async function checkHealth(): Promise<void> {
    if (!dot || !text) return;
    try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as HealthResponse;
        dot.classList.remove("err");
        dot.classList.add("ok");
        text.textContent = `Server online — v${body.version} · uptime ${Math.round(body.uptime)}s`;
    } catch (err) {
        dot.classList.remove("ok");
        dot.classList.add("err");
        text.textContent = `Server unreachable: ${(err as Error).message}`;
    }
}

void checkHealth();
setInterval(checkHealth, 15_000);
