export const metadata = {
    title: 'AI Agent Search',
    description: 'LangGraph Real Estate Agent',
}

export default function RootLayout({children,}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
        <body suppressHydrationWarning>
        {children}
        </body>
        </html>
    )
}