import { Link, useLocation } from "wouter";
import { Mail, User, BarChart3 } from "lucide-react";

export default function Navbar() {
  const [location] = useLocation();

  const navItems = [
    { path: "/", label: "Bulk Tickets", icon: BarChart3 },
    { path: "/single", label: "Single Email", icon: Mail },
  ];

  return (
    <nav className="bg-white border-b border-[hsl(214,32%,91%)] px-6 py-2">
      <div className="flex items-center space-x-8">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-[hsl(217,91%,60%)] rounded-lg flex items-center justify-center">
            <Mail className="text-white" size={16} />
          </div>
          <span className="font-semibold text-[hsl(220,26%,14%)]">Email Sender Pro</span>
        </div>
        
        <div className="flex items-center space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            
            return (
              <Link key={item.path} href={item.path}>
                <div className={`
                  flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${isActive 
                    ? 'bg-[hsl(217,91%,94%)] text-[hsl(217,91%,60%)]' 
                    : 'text-[hsl(215,16%,47%)] hover:text-[hsl(220,26%,14%)] hover:bg-[hsl(214,32%,96%)]'
                  }
                `}>
                  <Icon size={16} />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}