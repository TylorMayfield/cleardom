export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <a href="/">Home</a>
          <a>Account</a>
        </nav>
        {children}
      </body>
    </html>
  );
}

