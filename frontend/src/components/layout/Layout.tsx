import { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div style={styles.layout}>
      <Header />
      <main style={styles.main}>{children}</main>
      <Footer />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    position: 'relative',
  },
  main: {
    flex: 1,
    maxWidth: '1340px',
    margin: '0 auto',
    padding: '40px 32px',
    width: '100%',
  },
};
