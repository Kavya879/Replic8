import './globals.css';

export const metadata = {
  title: 'Dashboard',
  description: 'Enterprise observability dashboard'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}