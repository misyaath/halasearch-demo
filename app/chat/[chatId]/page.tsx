"use client";

import {CSSProperties, FormEvent, useEffect, useMemo, useRef, useState} from "react";
import {useParams} from "next/navigation";

type ChatMessage = {
    id: string;
    role: "user" | "assistant" | "tool";
    content: string;
};

const CHAT_ENDPOINT = "/app/api/chat";

export default function ChatPage() {
    const params = useParams<{ chatId: string }>();
    const chatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId;

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [prompt, setPrompt] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: "smooth"});
    }, [messages, isLoading]);

    const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmedPrompt = prompt.trim();

        if (!trimmedPrompt || isLoading || !chatId) {
            return;
        }

        const userMessage: ChatMessage = {
            id: `${Date.now()}-user`,
            role: "user",
            content: trimmedPrompt,
        };
        const assistantMessageId = `${Date.now()}-assistant`;

        setMessages((prev) => [...prev, userMessage, {id: assistantMessageId, role: "assistant", content: ""}]);
        setPrompt("");
        setIsLoading(true);

        try {
            const response = await fetch(CHAT_ENDPOINT, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({prompt: trimmedPrompt, chatId}),
            });

            if (!response.ok) {
                throw new Error(`Request failed (${response.status})`);
            }

            if (!response.body) {
                throw new Error("No response body received from the server.");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const {value, done} = await reader.read();
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, {stream: true});
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.startsWith("data:")) {
                        continue;
                    }

                    const rawData = line.slice(5).trim();
                    if (!rawData) {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(rawData) as { type?: string; content?: string };
                        if (!parsed.content) {
                            continue;
                        }

                        if (parsed.type === "text") {
                            setMessages((prev) =>
                                prev.map((msg) =>
                                    msg.id === assistantMessageId
                                        ? {...msg, content: `${msg.content}${parsed.content}`}
                                        : msg
                                )
                            );
                        } else {
                            setMessages((prev) => [
                                ...prev,
                                {
                                    id: `${Date.now()}-tool-${Math.random().toString(36).slice(2, 8)}`,
                                    role: "tool",
                                    content: parsed.content,
                                },
                            ]);
                        }
                    } catch {
                        // Ignore malformed streaming event payloads.
                    }
                }
            }
        } catch (error) {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === assistantMessageId
                        ? {
                            ...msg,
                            content: "Sorry, I could not process that request right now. Please try again.",
                        }
                        : msg
                )
            );
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main style={styles.page}>
            <section style={styles.chatCard}>
                <header style={styles.header}>
                    <h1 style={styles.title}>AI Property Search Agent</h1>
                    <p style={styles.subtitle}>Session: {chatId ?? "missing"}</p>
                </header>

                <div style={styles.messagesContainer}>
                    {!hasMessages ? (
                        <div style={styles.emptyState}>
                            Try: "Find 2-bedroom apartments in Dubai Marina under AED 120,000/year"
                        </div>
                    ) : (
                        messages.map((message) => (
                            <article
                                key={message.id}
                                style={{
                                    ...styles.message,
                                    ...(message.role === "user"
                                        ? styles.userMessage
                                        : message.role === "tool"
                                            ? styles.toolMessage
                                            : styles.assistantMessage),
                                }}
                            >
                                <strong style={styles.roleLabel}>
                                    {message.role === "user" ? "You" : message.role === "tool" ? "Tool" : "Agent"}
                                </strong>
                                <p style={styles.messageText}>
                                    {message.content || (isLoading && message.role === "assistant" ? "Thinking..." : "")}
                                </p>
                            </article>
                        ))
                    )}
                    <div ref={messagesEndRef}/>
                </div>

                <form onSubmit={handleSubmit} style={styles.form}>
                    <textarea
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="Tell me what kind of property you are looking for..."
                        rows={3}
                        style={styles.input}
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        style={{...styles.sendButton, ...(isLoading || !prompt.trim() ? styles.sendButtonDisabled : {})}}
                        disabled={isLoading || !prompt.trim() || !chatId}
                    >
                        {isLoading ? "Sending..." : "Send"}
                    </button>
                </form>
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
    chatCard: {
        width: "100%",
        maxWidth: "960px",
        height: "85vh",
        background: "rgba(15, 23, 42, 0.9)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        borderRadius: "20px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 24px 50px rgba(0, 0, 0, 0.35)",
    },
    header: {
        borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
        padding: "1.25rem 1.25rem 1rem",
    },
    title: {
        margin: 0,
        fontSize: "1.4rem",
        fontWeight: 700,
        color: "#f8fafc",
    },
    subtitle: {
        margin: "0.5rem 0 0",
        color: "#94a3b8",
        fontSize: "0.85rem",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    messagesContainer: {
        flex: 1,
        padding: "1rem 1.25rem",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "0.8rem",
    },
    emptyState: {
        margin: "auto",
        textAlign: "center",
        color: "#94a3b8",
        border: "1px dashed rgba(148, 163, 184, 0.35)",
        borderRadius: "12px",
        padding: "1.5rem",
        maxWidth: "680px",
    },
    message: {
        padding: "0.85rem 1rem",
        borderRadius: "14px",
        maxWidth: "85%",
        whiteSpace: "pre-wrap",
        lineHeight: 1.5,
    },
    userMessage: {
        alignSelf: "flex-end",
        background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
        color: "#f8fafc",
    },
    assistantMessage: {
        alignSelf: "flex-start",
        background: "rgba(30, 41, 59, 0.9)",
        border: "1px solid rgba(100, 116, 139, 0.35)",
        color: "#e2e8f0",
    },
    toolMessage: {
        alignSelf: "center",
        background: "rgba(113, 63, 18, 0.3)",
        border: "1px solid rgba(217, 119, 6, 0.45)",
        color: "#fde68a",
        fontSize: "0.9rem",
        maxWidth: "100%",
    },
    roleLabel: {
        display: "block",
        marginBottom: "0.3rem",
        fontSize: "0.75rem",
        opacity: 0.85,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
    },
    messageText: {
        margin: 0,
    },
    form: {
        borderTop: "1px solid rgba(148, 163, 184, 0.2)",
        padding: "1rem 1.25rem 1.25rem",
        display: "flex",
        flexWrap: "wrap",
        gap: "0.75rem",
        alignItems: "flex-end",
    },
    input: {
        flex: "1 1 520px",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        borderRadius: "12px",
        border: "1px solid rgba(100, 116, 139, 0.5)",
        background: "rgba(2, 6, 23, 0.6)",
        color: "#f8fafc",
        resize: "none",
        padding: "0.8rem 0.9rem",
        fontFamily: "inherit",
        fontSize: "0.95rem",
        outline: "none",
    },
    sendButton: {
        height: "44px",
        minWidth: "110px",
        flex: "0 0 auto",
        borderRadius: "10px",
        border: "none",
        background: "linear-gradient(135deg, #14b8a6 0%, #22d3ee 100%)",
        color: "#042f2e",
        fontWeight: 700,
        cursor: "pointer",
        padding: "0 1rem",
    },
    sendButtonDisabled: {
        opacity: 0.55,
        cursor: "not-allowed",
    },
};

