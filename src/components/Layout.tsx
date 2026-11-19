import { Outlet, NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import {
  LogOut,
  LayoutDashboard,
  FileText,
  Wrench,
  Menu,
  X,
  User as UserIcon,
  Building2,
  Shield,
  FileBarChart,
  Briefcase,
  ClipboardList,
} from 'lucide-react';
import { useState } from 'react';
import { clsx } from 'clsx';

export default function Layout() {
  const { userData, companies, activeCompany, setActiveCompanyId, dbConnected, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  const isMaster = userData?.role === 'master';
  const isAdminOrMaster = userData?.role === 'master' || userData?.role === 'admin';

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Vencimentos', path: '/vencimentos', icon: FileText },
    { name: 'Manutenção (Kanban)', path: '/manutencao', icon: Wrench },
    { name: 'Relatórios', path: '/relatorios', icon: FileBarChart },
    ...(isAdminOrMaster
      ? [
          { name: 'Estrutura Predial', path: '/estrutura', icon: Building2 },
          { name: 'Empresas', path: '/empresas', icon: Briefcase },
          { name: 'Usuários', path: '/usuarios', icon: Shield },
          { name: 'Auditoria', path: '/auditoria', icon: ClipboardList },
        ]
      : []),
  ];

  const isEmpresasOrUsuarios =
    location.pathname === '/empresas' ||
    (isMaster && (location.pathname === '/usuarios' || location.pathname === '/auditoria'));

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col md:flex-row font-sans text-neutral-300">
      {/* Mobile Header */}
      <div className="md:hidden bg-[#141414] border-b border-[#262626] text-neutral-100 flex items-center justify-between p-4 shadow-md z-20">
        <div className="text-xl font-bold flex items-center gap-2">Gestão Predial</div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar / Mobile Menu */}
      <div
        className={clsx(
          'fixed inset-0 bg-[#141414] border-r border-[#262626] text-neutral-300 z-10 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:w-64 md:flex-shrink-0 flex flex-col shadow-xl',
          mobileMenuOpen ? 'translate-x-0 mt-[60px] md:mt-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="p-6 hidden md:block border-b border-[#262626]">
          <h1 className="text-xl font-bold tracking-tight text-neutral-100">Gestão Predial</h1>
        </div>

        <div className="p-4 flex items-center gap-3 bg-[#0a0a0a]/50 border-b border-[#262626]">
          <div className="bg-[#262626] text-neutral-100 p-2 rounded-full shrink-0">
            <UserIcon size={20} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-neutral-100 truncate">{userData?.name}</div>
            <div className="text-xs text-indigo-400 capitalize">{userData?.role}</div>
          </div>
        </div>

        {/* Company Selector */}
        <div className="p-4 border-b border-[#262626] bg-[#101010]">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold mb-1.5 flex items-center gap-1.5">
            <Briefcase size={12} className="text-indigo-400" />
            Empresa Ativa
          </div>
          {companies.length > 0 ? (
            companies.length > 1 || isMaster ? (
              <select
                value={activeCompany?.id || ''}
                onChange={(e) => setActiveCompanyId(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 text-sm rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-500"
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                    {!company.active ? ' (Inativa)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="bg-[#0a0a0a] border border-[#262626] text-neutral-200 text-sm rounded-lg px-2.5 py-2 truncate font-medium">
                {activeCompany?.name}
              </div>
            )
          ) : (
            <div className="text-xs text-neutral-500 italic">Nenhuma empresa vinculada</div>
          )}
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors font-medium text-sm',
                  isActive
                    ? 'bg-indigo-600/10 text-indigo-400'
                    : 'text-neutral-400 hover:bg-[#262626] hover:text-neutral-100'
                )
              }
            >
              <item.icon size={18} />
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-[#262626]">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-neutral-400 hover:bg-red-500/10 hover:text-red-400 transition-colors font-medium"
          >
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {dbConnected === false && (
          <div className="bg-red-500/10 border-b border-red-500/30 text-red-300 px-6 py-2.5 text-sm">
            Sem conexão com o banco de dados Firebase Firestore. Verifique sua conexão com a internet.
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {!activeCompany && !isEmpresasOrUsuarios ? (
            <div className="h-full flex items-center justify-center">
              <div className="max-w-md w-full bg-[#141414] border border-[#262626] rounded-xl p-8 text-center shadow-xl space-y-4">
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
                  <Briefcase size={24} />
                </div>
                {isMaster ? (
                  <>
                    <h2 className="text-xl font-bold text-neutral-100">
                      Nenhuma empresa cadastrada
                    </h2>
                    <p className="text-sm text-neutral-400">
                      Cadastre a primeira empresa cliente para começar a gerenciar prédios,
                      chamados e vencimentos de forma isolada.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate('/empresas')}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                    >
                      Ir para Empresas
                    </button>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-neutral-100">
                      Aguardando vínculo com empresa
                    </h2>
                    <p className="text-sm text-neutral-400">
                      Sua conta (<span className="text-neutral-200">{userData?.email}</span>) ainda
                      não está vinculada a nenhuma empresa ativa. Solicite ao administrador do
                      sistema que libere seu acesso.
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </main>
    </div>
  );
}
