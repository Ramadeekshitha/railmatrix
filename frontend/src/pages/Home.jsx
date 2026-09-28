import React from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function HomePage() {
  const navigate = useNavigate();

  const departments = [
    {
      id: 'controller',
      title: 'Chief Section Controller Command Center',
      path: '/login/controller', // Updated to point to login
      badge: 'CENTRAL DECISION ENGINE',
      desc: 'Centralized corridor management, live GIS spatial model, and block sanctioning.',
      stats: '42 Active Requests | 2 Conflicts'
    },
    {
      id: 'track',
      title: 'Permanent Way & Track Engineering',
      path: '/login/engineering', // Updated to point to login
      badge: 'CIVIL & TRACK DEPT',
      desc: 'Track geometry car telemetry, ultrasonic flaw alerts, and tamping scheduling.',
      stats: '16 Active Defects | 94.2% THI'
    },
    {
      id: 'snt',
      title: 'Signal & Telecom (S&T) Engineering',
      path: '/login/signalling', // Updated to point to login
      badge: 'INTERLOCKING & KAVACH ATP',
      desc: 'Electronic interlocking relay monitoring, point machine diagnostics, and radio logs.',
      stats: '11 Active Faults | 98.1% Health'
    },
    {
      id: 'trd',
      title: 'Traction Power & Overhead Equipment (TRD)',
      path: '/login/trd', // Updated to point to login
      badge: '25kV HIGH VOLTAGE GRID',
      desc: 'OHE catenary wire calibration, circuit breaker telemetry, and power isolation.',
      stats: '15 Isolation Requests | 25.4 kV'
    }
  ];

  const stationTicketsData = [
    { station: 'KURNOOL CITY (KRNT)', tickets: '4 Scheduled', type: 'Civil & Track Work', status: 'Approved Window' },
    { station: 'GUNTAKAL JN (GTL)', tickets: '7 Scheduled', type: 'S&T Interlocking', status: 'Pending Sanction' },
    { station: 'DHONE JN (DHNE)', tickets: '2 Scheduled', type: 'TRD OHE Inspection', status: 'In Progress' },
    { station: 'SECUNDERABAD JN (SC)', tickets: '5 Scheduled', type: 'Kavach Telemetry', status: 'Queued' },
    { station: 'VIJAYAWADA JN (BZA)', tickets: '8 Scheduled', type: 'Bundled Block', status: 'Optimized' }
  ];

  const corridorMetrics = [
    { label: 'Active Line Blocks', value: '14 Sections', status: 'Normal Operations' },
    { label: 'Speed Restrictions (SR)', value: '6 Zones', status: 'Monitored' },
    { label: 'Kavach ATP Coverage', value: '99.4%', status: 'Optimal' },
    { label: 'Pending Sanctions', value: '3 Requests', status: 'Action Required' }
  ];

  const scrollToDepartments = () => {
    const el = document.getElementById('department-selection');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      
      {/* GOVERNMENT PORTAL HEADER */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 px-6 py-4 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <img src="/logo.png" alt="RailMatrix logo" className="w-9 h-9 rounded object-cover" />
            <div>
              <div className="text-base font-bold tracking-tight text-slate-900">
                RailMatrix Portal
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Ministry of Railways | CRIS Enterprise Division
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="hidden sm:flex items-center gap-2 px-3 py-1 rounded bg-sky-50 border border-sky-200 text-sky-800 font-bold">
              <span className="w-2 h-2 rounded bg-sky-600"></span>
              Live Telemetry Stream Active
            </span>
            <button
              onClick={scrollToDepartments}
              className="px-4 py-2 bg-sky-700 hover:bg-sky-800 active:scale-95 text-white font-bold rounded shadow-sm hover:shadow transition-all duration-150 cursor-pointer"
            >
              Select Department
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION WITH FULL VIDEO BACKGROUND & LIVE SCROLLING TICKER */}
      <section className="relative min-h-[calc(100vh-73px)] flex flex-col justify-between bg-slate-950 border-b border-slate-200 overflow-hidden">
        
        {/* Full-Height Video Background Layer */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover scale-105 opacity-50 filter contrast-105 brightness-90"
          >
            <source src="/train.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>

        {/* Hero Content Layer */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-20 text-center space-y-6 flex-1 flex flex-col justify-center items-center">
          <div className="inline-block px-3 py-1 rounded bg-slate-900/80 text-sky-300 font-mono text-xs font-bold uppercase tracking-wide border border-sky-500/40 backdrop-blur-md">
            Official Maintenance Block Optimization System
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight drop-shadow-md">
            Centralized Railway Infrastructure Management and Corridor Sanctioning
          </h1>

          <p className="max-w-3xl mx-auto text-sm sm:text-base text-slate-200 font-normal leading-relaxed drop-shadow">
            Standardized digital platform for section controllers and divisional engineers to schedule maintenance possessions, resolve spatial conflicts, and minimize train detention metrics across active rail corridors.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-4 font-mono text-xs">
            <button
              onClick={scrollToDepartments}
              className="px-6 py-3 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold rounded-lg shadow-lg hover:shadow-sky-500/50 transition-all duration-150 cursor-pointer"
            >
              Access Operational Hub &rarr;
            </button>
          </div>
        </div>

        {/* LIVE SCROLLING TICKER BAR */}
        <div className="relative z-10 border-t border-slate-800 bg-slate-900/90 backdrop-blur-md py-3 overflow-hidden">
          <div className="flex whitespace-nowrap animate-marquee">
            {[...stationTicketsData, ...stationTicketsData].map((item, idx) => (
              <div
                key={idx}
                className="inline-flex items-center gap-3 px-6 border-r border-slate-800 font-mono text-xs text-slate-300"
              >
                <span className="w-2 h-2 rounded bg-sky-400"></span>
                <span className="font-bold text-white">{item.station}:</span>
                <span className="text-sky-300 bg-sky-950 px-2 py-0.5 rounded border border-sky-800 font-bold">
                  {item.tickets}
                </span>
                <span>• {item.type} •</span>
                <span className="text-amber-300 font-bold">[{item.status}]</span>
              </div>
            ))}
          </div>
        </div>

      </section>

      {/* DEPARTMENT SELECTION SECTION */}
      <section id="department-selection" className="bg-slate-50/50 py-20 px-6 border-b border-slate-200">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <div className="text-xs font-mono font-bold text-sky-700 uppercase tracking-wider">
              Role-Based Access Control
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Operational Portals and Departmental Dashboards
            </h2>
            <p className="text-xs text-slate-600 font-mono">
              Select your authorized department to access domain-specific telemetry logs, asset registries, and maintenance request queues.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {departments.map((dept) => (
              <div
                key={dept.id}
                onClick={() => navigate(dept.path)}
                className="bg-sky-50/40 border border-sky-200/80 rounded-lg p-6 shadow-xs hover:bg-sky-50 hover:border-sky-500 transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded bg-white text-sky-900 border border-sky-200 shadow-xs">
                      {dept.badge}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-sky-800 transition-colors">
                    {dept.title}
                  </h3>
                  
                  <p className="text-xs text-slate-600 leading-normal font-sans">
                    {dept.desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-sky-200/60 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500 font-semibold">{dept.stats}</span>
                  <span className="text-sky-700 font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    Sign In Portal &rarr;
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THIRD SECTION WITH EXACT REFERENCE COLOR (#0B132B) */}
      <section className="bg-[#0B132B] text-white py-16 px-6 border-b border-slate-800">
        <div className="max-w-7xl mx-auto space-y-8">
          
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <div className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider">
              Division Overview
            </div>
            <h3 className="text-2xl font-black text-white tracking-tight">
              Active Corridor Telemetry & Metrics
            </h3>
            <p className="text-xs text-slate-300 font-mono">
              Real-time situational awareness indicators across managed divisional sections.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 font-mono text-xs">
            {corridorMetrics.map((metric, idx) => (
              <div key={idx} className="p-5 bg-[#141E33] border border-slate-700 rounded-lg space-y-2 shadow-xs">
                <span className="text-slate-400 block uppercase">{metric.label}</span>
                <span className="text-xl font-bold text-white block">{metric.value}</span>
                <span className="inline-block text-[10px] font-bold text-sky-300 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
                  {metric.status}
                </span>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* OFFICIAL WHITE GOVERNMENT FOOTER */}
      <footer className="bg-white text-slate-700 font-mono text-xs py-12 px-6 border-t border-slate-200">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="space-y-3">
            <div className="text-sm font-bold text-slate-900 tracking-wide">
              RailOpt-AI Maintenance Engine
            </div>
            <p className="text-slate-600 font-sans text-xs leading-normal">
              Automated maintenance block optimization system developed for Indian Railways division offices.
            </p>
            <div className="text-[10px] text-sky-800 bg-sky-50 px-2 py-1 rounded border border-sky-200 w-fit font-bold">
              CRIS Specification Compliant v4.2
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-slate-900 font-bold uppercase text-xs tracking-wider border-b border-slate-200 pb-1">
              Portal Directory
            </h4>
            <ul className="space-y-1 text-slate-600 font-semibold text-xs">
              <li>
                <Link to="/login/controller" className="hover:text-sky-700 transition-colors">Chief Section Controller</Link>
              </li>
              <li>
                <Link to="/login/engineering" className="hover:text-sky-700 transition-colors">Permanent Way & Track</Link>
              </li>
              <li>
                <Link to="/login/signalling" className="hover:text-sky-700 transition-colors">Signal & Telecom (S&T)</Link>
              </li>
              <li>
                <Link to="/login/trd" className="hover:text-sky-700 transition-colors">Traction Power (TRD)</Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="text-slate-900 font-bold uppercase text-xs tracking-wider border-b border-slate-200 pb-1">
              Server Status
            </h4>
            <div className="space-y-1 text-xs text-slate-600">
              <div>Database: SQLite (Connected)</div>
              <div>FastAPI Backend: Online</div>
              <div>Telemetry Feed: Active</div>
            </div>
          </div>

        </div>

        <div className="max-w-7xl mx-auto px-0 pt-8 mt-8 border-t border-slate-200 text-center text-[11px] text-slate-500 font-mono">
          <p>© 2026 Central Railway Information Systems (CRIS). All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}