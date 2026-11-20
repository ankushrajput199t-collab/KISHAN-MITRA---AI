import { useState } from "react";

import Navbar from "./components/Navbar";
import Dashboard from "./components/Dashboard";

import CropDoctor from "./features/CropDoctor";
import Weather from "./features/Weather";
import Chatbot from "./features/Chatbot";

import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("dashboard");

  const renderPage = () => {
    switch (activePage) {
      case "crop":
        return <CropDoctor />;
      case "weather":
        return <Weather />;
      case "chat":
        return <Chatbot />;
      default:
        return <Dashboard onNavigate={setActivePage} />;
    }
  };

  return (
    <div className="app">
      <Navbar activePage={activePage} onNavigate={setActivePage} />
      <main className="main-content">{renderPage()}</main>
    </div>
  );
}

export default App;
