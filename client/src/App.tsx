import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import POSApp from "./pages/POSApp";
import AccessCodeGate from "./components/pos/AccessCodeGate";

function AppContent() {
  const [verified, setVerified] = useState(() => {
    return localStorage.getItem("pos_access_verified") === "1";
  });

  if (!verified) {
    return <AccessCodeGate onVerified={() => setVerified(true)} />;
  }

  return (
    <Switch>
      <Route path={"/"} component={POSApp} />
      <Route path={"/pos"} component={POSApp} />
      <Route component={POSApp} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
