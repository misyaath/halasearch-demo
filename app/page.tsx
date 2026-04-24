"use client";

import {CSSProperties, useState} from "react";

const START_SESSION_ENDPOINT = "/app/api/chat/session";

export default function Home() {
    const [isStarting, setIsStarting] = useState(false);

    const handleStartChat = async () => {
        if (isStarting) {
            return;
        }

        setIsStarting(true);
        try {
            const response = await fetch(START_SESSION_ENDPOINT, {method: "POST"});
            if (!response.ok) {
                throw new Error(`Failed to start chat (${response.status})`);
            }

            const data = (await response.json()) as { chatId?: string };
            if (!data.chatId) {
                throw new Error("No chat id returned from server");
            }

            window.location.href = `${window.location.origin}/chat/${data.chatId}`;
        } catch (error) {
            console.error(error);
            setIsStarting(false);
        }
    };

    return (
        <main style={styles.page}>
            <section style={styles.heroCard}>
                <h1 style={styles.title}>AI Property Search Agent</h1>
                <p style={styles.subtitle}>Start a private chat session to find apartments, compare areas, and analyze
                    annual rent options.</p>
                <button
                    type="button"
                    onClick={handleStartChat}
                    style={{...styles.startButton, ...(isStarting ? styles.startButtonDisabled : {})}}
                    disabled={isStarting}
                >
                    {isStarting ? "Starting chat..." : "Start Chat"}
                </button>
            </section>
        </main>
    );
}

const styles: Record<string, CSSProperties> = {
    page: {
        minHeight: "100vh",
        margin: 0,
        padding: "2rem",
        background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#e5e7eb",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
    },
    heroCard: {
        width: "100%",
        maxWidth: "680px",
        padding: "2rem",
        borderRadius: "20px",
        background: "rgba(15, 23, 42, 0.9)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        boxShadow: "0 24px 50px rgba(0, 0, 0, 0.35)",
        textAlign: "center",
    },
    title: {
        margin: 0,
        fontSize: "2rem",
        color: "#f8fafc",
    },
    subtitle: {
        margin: "1rem 0 1.5rem",
        color: "#94a3b8",
        lineHeight: 1.5,
    },
    startButton: {
        height: "48px",
        minWidth: "170px",
        borderRadius: "12px",
        border: "none",
        background: "linear-gradient(135deg, #14b8a6 0%, #22d3ee 100%)",
        color: "#042f2e",
        fontWeight: 700,
        cursor: "pointer",
        padding: "0 1.25rem",
        fontSize: "1rem",
    },
    startButtonDisabled: {
        opacity: 0.55,
        cursor: "not-allowed",
    },
};

