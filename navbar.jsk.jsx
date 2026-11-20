import{
  Sprout,
  Home,
  CloudSun,
  MessageCircle,
  Stethoscope,
} from "lucide-react";

function Navbar({ activePage, onNavigate }) {
  const links = [
    { id: "dashboard", label: "Home", icon: Home },
    { id: "crop", label: "Crop Doctor", icon: Stethoscope },
    { id: "weather", label: "Weather", icon: CloudSun },
    { id: "chat", label: "Ask Kisan AI", icon: MessageCircle },
  ];

  return (
    <header className="navbar">
      <button
        className="brand"
        onClick={() => onNavigate("dashboard")}
        aria-label="Go to dashboard"
      >
        <span className="brand-icon"><Sprout size={25} /></span>
        <span>KisanMitra <strong>AI</strong></span>
      </button>

      <nav className="nav-links" aria-label="Main navigation">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <button
              key={link.id}
              className={`nav-link ${activePage === link.id ? "active" : ""}`}
              onClick={() => onNavigate(link.id)}
            >
              <Icon size={17} />
              {link.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

export default Navbar;
