import { SignInProvider } from './contexts/SignInContext';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import TimeJourney from './components/TimeJourney';
import ForYou from './components/ForYou';
import Trust from './components/Trust';
import CTA from './components/CTA';
import Footer from './components/Footer';
import StickyMobileCTA from './components/StickyMobileCTA';
import SignInModal from './components/SignInModal';

export default function App() {
  return (
    <SignInProvider>
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <TimeJourney />
        <ForYou />
        <Trust />
        <CTA />
      </main>
      <Footer />
      <StickyMobileCTA />
      <SignInModal />
    </SignInProvider>
  );
}
