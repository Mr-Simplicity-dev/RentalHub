import { TOUR_STEPS } from '../config/tourConfig';
import { WORKFLOW_TOURS } from '../config/tourWorkflows';

const allSteps = [
  ...Object.values(TOUR_STEPS).flat(),
  ...Object.values(WORKFLOW_TOURS).flatMap((workflow) => workflow.steps || []),
];

const titleTranslations = {
  fr: {
    'Your Properties': 'Vos propriétés', 'Property Location': 'Emplacement du bien', 'Wallet & Payments': 'Portefeuille et paiements',
    'Recent Activity': 'Activité récente', 'Quick Actions': 'Actions rapides', 'Request Legal Help': 'Demander une aide juridique',
    'Chat Support': 'Assistance par chat', 'Your Listings': 'Vos annonces', Messages: 'Messages', Withdrawals: 'Retraits',
    'State Migration': 'Changement d’État', 'Assigned Landlord': 'Propriétaire assigné', 'Agent Tools': 'Outils de l’agent',
    'Your Profile': 'Votre profil', 'Active Cases': 'Dossiers actifs', 'Evidence Review': 'Examen des preuves',
    'Your Clients': 'Vos clients', Earnings: 'Revenus', 'User Management': 'Gestion des utilisateurs',
    'Properties Management': 'Gestion des biens', Applications: 'Candidatures', 'Pending Verifications': 'Vérifications en attente',
    'Administration Tools': 'Outils d’administration', 'Transaction Management': 'Gestion des transactions',
    'State Admin Performance': 'Performance des administrateurs d’État', 'Frozen Funds': 'Fonds gelés',
    'Financial Workspace': 'Espace financier', 'Local Finance Overview': 'Aperçu financier local',
    'Request a Withdrawal': 'Demander un retrait', 'Withdrawal History': 'Historique des retraits',
    'State Operations': 'Opérations de l’État', 'Financial Snapshot': 'Aperçu financier',
    'Commission Withdrawal': 'Retrait de commission', 'State Administration Tools': 'Outils d’administration de l’État',
    'National Financial Command': 'Pilotage financier national', 'Transaction Oversight': 'Supervision des transactions',
    'State Performance': 'Performance des États', 'Withdrawal Decisions': 'Décisions de retrait',
    'Transportation Bookings': 'Réservations de transport', 'Route Management': 'Gestion des itinéraires',
    'Driver Management': 'Gestion des chauffeurs', 'Revenue Tracking': 'Suivi des revenus',
    'State Logistics Overview': 'Aperçu logistique de l’État', 'State Booking Queue': 'File des réservations de l’État',
    'Service Activity': 'Activité des services', 'Assigned Jurisdiction': 'Zone assignée',
    'National Logistics Overview': 'Aperçu logistique national', 'State Jurisdictions': 'Zones des États',
    'National Alert Queue': 'File nationale des alertes', 'System Health': 'État du système',
    'Fumigation Bookings': 'Réservations de désinfection', 'Service Management': 'Gestion des services',
    'Service Providers': 'Prestataires de services', 'Payment & Revenue': 'Paiements et revenus',
    'National Service Overview': 'Aperçu national des services', 'Operational Health': 'Santé opérationnelle',
    'National Bookings': 'Réservations nationales', 'Provider Coverage': 'Couverture des prestataires',
    'Recruitment Overview': 'Aperçu du recrutement', 'Recruitment Cycles': 'Cycles de recrutement',
    'Candidate Management': 'Gestion des candidats', 'Support Tickets': 'Tickets d’assistance',
    'Property Requests': 'Demandes de biens', 'Tenancy Operations': 'Opérations locatives',
    'Dashboard Overview': 'Aperçu du tableau de bord', 'Migration Queue': 'File des migrations',
    'Operational Overview': 'Aperçu opérationnel', 'Audit Trail': 'Journal d’audit',
    'Platform Management': 'Gestion de la plateforme', 'Data & System': 'Données et système',
    'Quick Navigation': 'Navigation rapide', 'Marketing & Content': 'Marketing et contenu', 'Legal & Trust': 'Juridique et confiance',
    'Find the right property': 'Trouver le bon logement', 'Move from saved property to application': 'Passer du bien enregistré à la candidature',
    'Track applications and negotiations': 'Suivre candidatures et négociations', 'Keep conversations in one place': 'Regrouper les conversations',
    'Confirm payment status': 'Confirmer le statut du paiement', 'Ask for help safely': 'Demander de l’aide en toute sécurité',
    'Manage your property portfolio': 'Gérer votre portefeuille immobilier', 'Prepare a complete listing': 'Préparer une annonce complète',
    'Review applicants and negotiate rent': 'Examiner les candidats et négocier le loyer', 'Withdraw available rent securely': 'Retirer le loyer disponible en sécurité',
    'Message the right participant': 'Contacter le bon participant', 'Audit incoming payment activity': 'Contrôler les paiements reçus',
    'Escalate an issue with context': 'Signaler un problème avec son contexte', 'Confirm your landlord assignment': 'Confirmer votre propriétaire assigné',
    'Understand your earnings': 'Comprendre vos revenus', 'Track secure withdrawals': 'Suivre les retraits sécurisés',
    'Manage assigned properties': 'Gérer les biens assignés', 'Coordinate through messages': 'Coordonner par messagerie',
    'Escalate operational blockers': 'Signaler les blocages opérationnels', 'Prioritize active cases': 'Prioriser les dossiers actifs',
    'Verify evidence integrity': 'Vérifier l’intégrité des preuves', 'Find and follow disputes': 'Trouver et suivre les litiges',
    'Keep legal communication recorded': 'Conserver les échanges juridiques', 'Request operational support': 'Demander une assistance opérationnelle',
    'Review your bookings': 'Examiner vos réservations', 'Match bookings to payments': 'Associer réservations et paiements',
    'Get service support': 'Obtenir de l’aide pour un service', 'Keep profile details current': 'Maintenir le profil à jour',
    'Monitor verification status': 'Suivre le statut de vérification', 'Replay help whenever you need it': 'Rejouer l’aide à tout moment',
  },
  ar: {
    'Your Properties': 'عقاراتك', 'Property Location': 'موقع العقار', 'Wallet & Payments': 'المحفظة والمدفوعات',
    'Recent Activity': 'النشاط الأخير', 'Quick Actions': 'إجراءات سريعة', 'Request Legal Help': 'طلب مساعدة قانونية',
    'Chat Support': 'دعم المحادثة', 'Your Listings': 'إعلاناتك', Messages: 'الرسائل', Withdrawals: 'عمليات السحب',
    'State Migration': 'تغيير الولاية', 'Assigned Landlord': 'المالك المعيّن', 'Agent Tools': 'أدوات الوكيل',
    'Your Profile': 'ملفك الشخصي', 'Active Cases': 'القضايا النشطة', 'Evidence Review': 'مراجعة الأدلة',
    'Your Clients': 'عملاؤك', Earnings: 'الأرباح', 'User Management': 'إدارة المستخدمين',
    'Properties Management': 'إدارة العقارات', Applications: 'الطلبات', 'Pending Verifications': 'التحققات المعلقة',
    'Administration Tools': 'أدوات الإدارة', 'Transaction Management': 'إدارة المعاملات', 'State Admin Performance': 'أداء مسؤولي الولاية',
    'Frozen Funds': 'الأموال المجمدة', 'Financial Workspace': 'مساحة العمل المالية', 'Local Finance Overview': 'نظرة مالية محلية',
    'Request a Withdrawal': 'طلب سحب', 'Withdrawal History': 'سجل السحب', 'State Operations': 'عمليات الولاية',
    'Financial Snapshot': 'ملخص مالي', 'Commission Withdrawal': 'سحب العمولة', 'State Administration Tools': 'أدوات إدارة الولاية',
    'National Financial Command': 'القيادة المالية الوطنية', 'Transaction Oversight': 'الإشراف على المعاملات',
    'State Performance': 'أداء الولايات', 'Withdrawal Decisions': 'قرارات السحب', 'Transportation Bookings': 'حجوزات النقل',
    'Route Management': 'إدارة المسارات', 'Driver Management': 'إدارة السائقين', 'Revenue Tracking': 'تتبع الإيرادات',
    'State Logistics Overview': 'نظرة لوجستية للولاية', 'State Booking Queue': 'قائمة حجوزات الولاية',
    'Service Activity': 'نشاط الخدمة', 'Assigned Jurisdiction': 'النطاق المعيّن', 'National Logistics Overview': 'النظرة اللوجستية الوطنية',
    'State Jurisdictions': 'نطاقات الولايات', 'National Alert Queue': 'قائمة التنبيهات الوطنية', 'System Health': 'سلامة النظام',
    'Fumigation Bookings': 'حجوزات التعقيم', 'Service Management': 'إدارة الخدمات', 'Service Providers': 'مقدمو الخدمات',
    'Payment & Revenue': 'المدفوعات والإيرادات', 'National Service Overview': 'نظرة وطنية للخدمات',
    'Operational Health': 'السلامة التشغيلية', 'National Bookings': 'الحجوزات الوطنية', 'Provider Coverage': 'تغطية مقدمي الخدمة',
    'Recruitment Overview': 'نظرة على التوظيف', 'Recruitment Cycles': 'دورات التوظيف', 'Candidate Management': 'إدارة المرشحين',
    'Support Tickets': 'تذاكر الدعم', 'Property Requests': 'طلبات العقارات', 'Tenancy Operations': 'عمليات الإيجار',
    'Dashboard Overview': 'نظرة على لوحة التحكم', 'Migration Queue': 'قائمة النقل', 'Operational Overview': 'نظرة تشغيلية',
    'Audit Trail': 'سجل التدقيق', 'Platform Management': 'إدارة المنصة', 'Data & System': 'البيانات والنظام',
    'Quick Navigation': 'تنقل سريع', 'Marketing & Content': 'التسويق والمحتوى', 'Legal & Trust': 'القانون والثقة',
    'Find the right property': 'العثور على العقار المناسب', 'Move from saved property to application': 'الانتقال من العقار المحفوظ إلى الطلب',
    'Track applications and negotiations': 'متابعة الطلبات والمفاوضات', 'Keep conversations in one place': 'جمع المحادثات في مكان واحد',
    'Confirm payment status': 'تأكيد حالة الدفع', 'Ask for help safely': 'طلب المساعدة بأمان',
    'Manage your property portfolio': 'إدارة محفظة عقاراتك', 'Prepare a complete listing': 'إعداد إعلان مكتمل',
    'Review applicants and negotiate rent': 'مراجعة المتقدمين والتفاوض على الإيجار', 'Withdraw available rent securely': 'سحب الإيجار المتاح بأمان',
    'Message the right participant': 'مراسلة الطرف المناسب', 'Audit incoming payment activity': 'مراجعة المدفوعات الواردة',
    'Escalate an issue with context': 'تصعيد المشكلة مع سياقها', 'Confirm your landlord assignment': 'تأكيد تعيين المالك',
    'Understand your earnings': 'فهم أرباحك', 'Track secure withdrawals': 'متابعة السحوبات الآمنة',
    'Manage assigned properties': 'إدارة العقارات المعيّنة', 'Coordinate through messages': 'التنسيق عبر الرسائل',
    'Escalate operational blockers': 'تصعيد العوائق التشغيلية', 'Prioritize active cases': 'ترتيب القضايا النشطة',
    'Verify evidence integrity': 'التحقق من سلامة الأدلة', 'Find and follow disputes': 'البحث عن النزاعات ومتابعتها',
    'Keep legal communication recorded': 'حفظ المراسلات القانونية', 'Request operational support': 'طلب دعم تشغيلي',
    'Review your bookings': 'مراجعة حجوزاتك', 'Match bookings to payments': 'مطابقة الحجوزات بالمدفوعات',
    'Get service support': 'الحصول على دعم الخدمة', 'Keep profile details current': 'تحديث بيانات الملف الشخصي',
    'Monitor verification status': 'متابعة حالة التحقق', 'Replay help whenever you need it': 'إعادة تشغيل المساعدة عند الحاجة',
  },
  ru: {
    'Your Properties': 'Ваши объекты', 'Property Location': 'Расположение объекта', 'Wallet & Payments': 'Кошелёк и платежи',
    'Recent Activity': 'Последние действия', 'Quick Actions': 'Быстрые действия', 'Request Legal Help': 'Запросить юридическую помощь',
    'Chat Support': 'Поддержка в чате', 'Your Listings': 'Ваши объявления', Messages: 'Сообщения', Withdrawals: 'Вывод средств',
    'State Migration': 'Смена штата', 'Assigned Landlord': 'Назначенный арендодатель', 'Agent Tools': 'Инструменты агента',
    'Your Profile': 'Ваш профиль', 'Active Cases': 'Активные дела', 'Evidence Review': 'Проверка доказательств',
    'Your Clients': 'Ваши клиенты', Earnings: 'Доходы', 'User Management': 'Управление пользователями',
    'Properties Management': 'Управление объектами', Applications: 'Заявки', 'Pending Verifications': 'Ожидающие проверки',
    'Administration Tools': 'Инструменты администратора', 'Transaction Management': 'Управление транзакциями',
    'State Admin Performance': 'Работа администраторов штатов', 'Frozen Funds': 'Замороженные средства',
    'Financial Workspace': 'Финансовое рабочее пространство', 'Local Finance Overview': 'Обзор местных финансов',
    'Request a Withdrawal': 'Запросить вывод', 'Withdrawal History': 'История выводов', 'State Operations': 'Операции штата',
    'Financial Snapshot': 'Финансовая сводка', 'Commission Withdrawal': 'Вывод комиссии',
    'State Administration Tools': 'Инструменты управления штатом', 'National Financial Command': 'Национальное финансовое управление',
    'Transaction Oversight': 'Контроль транзакций', 'State Performance': 'Показатели штатов', 'Withdrawal Decisions': 'Решения по выводам',
    'Transportation Bookings': 'Транспортные бронирования', 'Route Management': 'Управление маршрутами',
    'Driver Management': 'Управление водителями', 'Revenue Tracking': 'Учёт доходов',
    'State Logistics Overview': 'Обзор логистики штата', 'State Booking Queue': 'Очередь бронирований штата',
    'Service Activity': 'Активность услуг', 'Assigned Jurisdiction': 'Назначенная зона',
    'National Logistics Overview': 'Национальный обзор логистики', 'State Jurisdictions': 'Зоны штатов',
    'National Alert Queue': 'Национальная очередь предупреждений', 'System Health': 'Состояние системы',
    'Fumigation Bookings': 'Заказы на обработку', 'Service Management': 'Управление услугами', 'Service Providers': 'Поставщики услуг',
    'Payment & Revenue': 'Платежи и доход', 'National Service Overview': 'Национальный обзор услуг',
    'Operational Health': 'Состояние операций', 'National Bookings': 'Национальные бронирования', 'Provider Coverage': 'Охват поставщиков',
    'Recruitment Overview': 'Обзор найма', 'Recruitment Cycles': 'Циклы найма', 'Candidate Management': 'Управление кандидатами',
    'Support Tickets': 'Обращения в поддержку', 'Property Requests': 'Запросы на недвижимость', 'Tenancy Operations': 'Арендные операции',
    'Dashboard Overview': 'Обзор панели', 'Migration Queue': 'Очередь миграции', 'Operational Overview': 'Обзор операций',
    'Audit Trail': 'Журнал аудита', 'Platform Management': 'Управление платформой', 'Data & System': 'Данные и система',
    'Quick Navigation': 'Быстрая навигация', 'Marketing & Content': 'Маркетинг и контент', 'Legal & Trust': 'Право и доверие',
    'Find the right property': 'Найдите подходящий объект', 'Move from saved property to application': 'Перейдите от сохранённого объекта к заявке',
    'Track applications and negotiations': 'Отслеживайте заявки и переговоры', 'Keep conversations in one place': 'Храните переписку в одном месте',
    'Confirm payment status': 'Проверьте статус платежа', 'Ask for help safely': 'Безопасно запросите помощь',
    'Manage your property portfolio': 'Управляйте портфелем объектов', 'Prepare a complete listing': 'Подготовьте полное объявление',
    'Review applicants and negotiate rent': 'Проверяйте кандидатов и согласуйте аренду', 'Withdraw available rent securely': 'Безопасно выводите доступную аренду',
    'Message the right participant': 'Напишите нужному участнику', 'Audit incoming payment activity': 'Проверяйте входящие платежи',
    'Escalate an issue with context': 'Передайте проблему с контекстом', 'Confirm your landlord assignment': 'Подтвердите назначенного арендодателя',
    'Understand your earnings': 'Разберитесь в доходах', 'Track secure withdrawals': 'Отслеживайте безопасные выводы',
    'Manage assigned properties': 'Управляйте назначенными объектами', 'Coordinate through messages': 'Координируйте работу в сообщениях',
    'Escalate operational blockers': 'Передавайте операционные проблемы', 'Prioritize active cases': 'Расставляйте приоритеты активных дел',
    'Verify evidence integrity': 'Проверяйте целостность доказательств', 'Find and follow disputes': 'Находите и отслеживайте споры',
    'Keep legal communication recorded': 'Сохраняйте юридическую переписку', 'Request operational support': 'Запросите операционную поддержку',
    'Review your bookings': 'Просматривайте бронирования', 'Match bookings to payments': 'Сопоставляйте бронирования и платежи',
    'Get service support': 'Получите поддержку по услуге', 'Keep profile details current': 'Поддерживайте профиль актуальным',
    'Monitor verification status': 'Следите за статусом проверки', 'Replay help whenever you need it': 'Повторяйте подсказки при необходимости',
  },
  zh: {
    'Your Properties': '您的房源', 'Property Location': '房源位置', 'Wallet & Payments': '钱包与付款', 'Recent Activity': '近期活动',
    'Quick Actions': '快捷操作', 'Request Legal Help': '申请法律帮助', 'Chat Support': '在线客服', 'Your Listings': '您的发布',
    Messages: '消息', Withdrawals: '提现', 'State Migration': '州属变更', 'Assigned Landlord': '已分配房东', 'Agent Tools': '代理工具',
    'Your Profile': '您的资料', 'Active Cases': '进行中的案件', 'Evidence Review': '证据审查', 'Your Clients': '您的客户', Earnings: '收益',
    'User Management': '用户管理', 'Properties Management': '房源管理', Applications: '申请', 'Pending Verifications': '待处理验证',
    'Administration Tools': '管理工具', 'Transaction Management': '交易管理', 'State Admin Performance': '州管理员绩效',
    'Frozen Funds': '冻结资金', 'Financial Workspace': '财务工作区', 'Local Finance Overview': '本地财务概览',
    'Request a Withdrawal': '申请提现', 'Withdrawal History': '提现记录', 'State Operations': '州级运营', 'Financial Snapshot': '财务概况',
    'Commission Withdrawal': '佣金提现', 'State Administration Tools': '州管理工具', 'National Financial Command': '全国财务管理',
    'Transaction Oversight': '交易监督', 'State Performance': '州级绩效', 'Withdrawal Decisions': '提现审批',
    'Transportation Bookings': '运输预订', 'Route Management': '路线管理', 'Driver Management': '司机管理', 'Revenue Tracking': '收入跟踪',
    'State Logistics Overview': '州物流概览', 'State Booking Queue': '州预订队列', 'Service Activity': '服务活动', 'Assigned Jurisdiction': '已分配管辖区',
    'National Logistics Overview': '全国物流概览', 'State Jurisdictions': '州管辖区', 'National Alert Queue': '全国警报队列', 'System Health': '系统健康',
    'Fumigation Bookings': '消杀预订', 'Service Management': '服务管理', 'Service Providers': '服务商', 'Payment & Revenue': '付款与收入',
    'National Service Overview': '全国服务概览', 'Operational Health': '运营健康', 'National Bookings': '全国预订', 'Provider Coverage': '服务商覆盖',
    'Recruitment Overview': '招聘概览', 'Recruitment Cycles': '招聘周期', 'Candidate Management': '候选人管理', 'Support Tickets': '支持工单',
    'Property Requests': '房源请求', 'Tenancy Operations': '租赁运营', 'Dashboard Overview': '控制台概览', 'Migration Queue': '迁移队列',
    'Operational Overview': '运营概览', 'Audit Trail': '审计记录', 'Platform Management': '平台管理', 'Data & System': '数据与系统',
    'Quick Navigation': '快捷导航', 'Marketing & Content': '营销与内容', 'Legal & Trust': '法律与信任',
    'Find the right property': '找到合适的房源', 'Move from saved property to application': '从收藏房源进入申请',
    'Track applications and negotiations': '跟踪申请与协商', 'Keep conversations in one place': '集中管理对话',
    'Confirm payment status': '确认付款状态', 'Ask for help safely': '安全地寻求帮助', 'Manage your property portfolio': '管理房源组合',
    'Prepare a complete listing': '准备完整房源信息', 'Review applicants and negotiate rent': '审查申请人并协商租金',
    'Withdraw available rent securely': '安全提现可用租金', 'Message the right participant': '联系正确的参与者',
    'Audit incoming payment activity': '核对收款活动', 'Escalate an issue with context': '带背景信息升级问题',
    'Confirm your landlord assignment': '确认分配的房东', 'Understand your earnings': '了解您的收益', 'Track secure withdrawals': '跟踪安全提现',
    'Manage assigned properties': '管理已分配房源', 'Coordinate through messages': '通过消息协调', 'Escalate operational blockers': '升级运营障碍',
    'Prioritize active cases': '排列进行中案件的优先级', 'Verify evidence integrity': '验证证据完整性', 'Find and follow disputes': '查找并跟踪纠纷',
    'Keep legal communication recorded': '保留法律沟通记录', 'Request operational support': '申请运营支持', 'Review your bookings': '查看您的预订',
    'Match bookings to payments': '核对预订与付款', 'Get service support': '获取服务支持', 'Keep profile details current': '保持资料最新',
    'Monitor verification status': '跟踪验证状态', 'Replay help whenever you need it': '需要时重播帮助',
  },
};

const common = {
  en: {
    ui: { eyebrow: 'RentalHub guided tour', close_and_skip: 'Close and skip the guided tour', finding_target: 'Finding this control on the dashboard…', not_available_for_account: 'This step is not available for this account.', target_not_available: 'This dashboard section is not available yet.', target_not_available_body: 'It may still be loading or unavailable for this account. Retry, or continue without interrupting the tour.', retry_target: 'Retry target', finish_tour: 'Finish tour', skip_step: 'Skip this step', interact_hint: 'Use the highlighted control to continue automatically.', step_progress: 'Step {{current}} of {{total}}', back: 'Back', next: 'Next', finish: 'Finish', skip_complete: 'Skip the complete tour', searching_sr: 'Searching for the dashboard control.', unavailable_sr: 'The dashboard control is currently unavailable.', rentalhub_dashboard: 'RentalHub dashboard' },
    welcome: { benefit_controls: 'Highlights the real controls on your dashboard', benefit_role: 'Personalized for your RentalHub account role', benefit_replay: 'Available to replay whenever you need a refresher', close_intro: 'Close guided tour introduction', skip_label: 'Skip the guided tour', eyebrow: 'Your personal dashboard guide', resume_title: 'Continue where you stopped', returning_title: 'Welcome back to RentalHub', new_title: 'Welcome to RentalHub NG', resume_description: 'Your progress is saved. Resume from the last step you viewed, or restart later from your profile.', returning_description: 'Take a quick refresher and rediscover the controls that matter most for your account.', new_description: 'Let us show you the most useful controls for your account with a short, focused walkthrough.', maybe_later: 'Maybe later', resume_button: 'Resume guided tour', start_button: 'Start guided tour', duration: 'About 2 minutes · you remain in control' },
    profile: { title: 'Guided tours', description: 'Replay your dashboard guide or start a focused workflow.', last_completed: 'Last completed {{date}}', replay: 'Replay dashboard tour', workflow_library: 'Focused workflow guides', workflow_library_description: 'Practice a complete task with safe, contextual guidance. Tours never submit payments or forms for you.', start_workflow: 'Start workflow guide' },
  },
  fr: {
    ui: { eyebrow: 'Visite guidée RentalHub', close_and_skip: 'Fermer et ignorer la visite guidée', finding_target: 'Recherche de cette commande…', not_available_for_account: 'Cette étape n’est pas disponible pour ce compte.', target_not_available: 'Cette section n’est pas encore disponible.', target_not_available_body: 'Elle peut être en cours de chargement ou indisponible pour ce compte. Réessayez ou continuez la visite.', retry_target: 'Réessayer', finish_tour: 'Terminer la visite', skip_step: 'Ignorer cette étape', interact_hint: 'Utilisez la commande mise en évidence pour continuer automatiquement.', step_progress: 'Étape {{current}} sur {{total}}', back: 'Retour', next: 'Suivant', finish: 'Terminer', skip_complete: 'Ignorer toute la visite', searching_sr: 'Recherche de la commande.', unavailable_sr: 'La commande est indisponible.', rentalhub_dashboard: 'Tableau de bord RentalHub' },
    welcome: { benefit_controls: 'Met en évidence les vraies commandes du tableau de bord', benefit_role: 'Adapté au rôle de votre compte RentalHub', benefit_replay: 'Disponible à tout moment pour une révision', close_intro: 'Fermer l’introduction', skip_label: 'Ignorer la visite guidée', eyebrow: 'Votre guide personnel', resume_title: 'Reprendre où vous vous êtes arrêté', returning_title: 'Bon retour sur RentalHub', new_title: 'Bienvenue sur RentalHub NG', resume_description: 'Votre progression est enregistrée. Reprenez à la dernière étape consultée.', returning_description: 'Redécouvrez rapidement les commandes importantes pour votre compte.', new_description: 'Découvrez les commandes les plus utiles avec une visite courte et ciblée.', maybe_later: 'Plus tard', resume_button: 'Reprendre la visite', start_button: 'Démarrer la visite', duration: 'Environ 2 minutes · vous gardez le contrôle' },
    profile: { title: 'Visites guidées', description: 'Relancez le guide du tableau de bord ou un parcours ciblé.', last_completed: 'Terminé le {{date}}', replay: 'Rejouer la visite du tableau de bord', workflow_library: 'Guides de parcours ciblés', workflow_library_description: 'Entraînez-vous avec une aide sûre et contextuelle. La visite ne soumet jamais de paiement ni de formulaire.', start_workflow: 'Démarrer le guide' },
  },
  ar: {
    ui: { eyebrow: 'جولة RentalHub الإرشادية', close_and_skip: 'إغلاق الجولة وتخطيها', finding_target: 'جارٍ البحث عن عنصر التحكم…', not_available_for_account: 'هذه الخطوة غير متاحة لهذا الحساب.', target_not_available: 'هذا القسم غير متاح بعد.', target_not_available_body: 'قد يكون قيد التحميل أو غير متاح لهذا الحساب. أعد المحاولة أو تابع الجولة.', retry_target: 'إعادة المحاولة', finish_tour: 'إنهاء الجولة', skip_step: 'تخطي هذه الخطوة', interact_hint: 'استخدم العنصر المميز للمتابعة تلقائيًا.', step_progress: 'الخطوة {{current}} من {{total}}', back: 'رجوع', next: 'التالي', finish: 'إنهاء', skip_complete: 'تخطي الجولة كاملة', searching_sr: 'جارٍ البحث عن عنصر التحكم.', unavailable_sr: 'عنصر التحكم غير متاح حاليًا.', rentalhub_dashboard: 'لوحة RentalHub' },
    welcome: { benefit_controls: 'توضح عناصر التحكم الحقيقية في لوحة حسابك', benefit_role: 'مخصصة لدور حسابك في RentalHub', benefit_replay: 'يمكن إعادة تشغيلها عند الحاجة', close_intro: 'إغلاق مقدمة الجولة', skip_label: 'تخطي الجولة الإرشادية', eyebrow: 'دليلك الشخصي للوحة التحكم', resume_title: 'تابع من حيث توقفت', returning_title: 'مرحبًا بعودتك إلى RentalHub', new_title: 'مرحبًا بك في RentalHub NG', resume_description: 'تم حفظ تقدمك. تابع من آخر خطوة شاهدتها.', returning_description: 'راجع بسرعة أهم عناصر التحكم لحسابك.', new_description: 'دعنا نعرض أهم عناصر التحكم في جولة قصيرة ومركزة.', maybe_later: 'لاحقًا', resume_button: 'متابعة الجولة', start_button: 'بدء الجولة', duration: 'نحو دقيقتين · أنت المتحكم' },
    profile: { title: 'الجولات الإرشادية', description: 'أعد جولة لوحة التحكم أو ابدأ مسارًا محددًا.', last_completed: 'آخر إكمال {{date}}', replay: 'إعادة جولة لوحة التحكم', workflow_library: 'أدلة المسارات المحددة', workflow_library_description: 'تدرّب بإرشاد آمن ومراعي للسياق. لا ترسل الجولة دفعات أو نماذج نيابةً عنك.', start_workflow: 'بدء دليل المسار' },
  },
  ru: {
    ui: { eyebrow: 'Интерактивный тур RentalHub', close_and_skip: 'Закрыть и пропустить тур', finding_target: 'Поиск элемента управления…', not_available_for_account: 'Этот шаг недоступен для данного аккаунта.', target_not_available: 'Этот раздел пока недоступен.', target_not_available_body: 'Он может загружаться или быть недоступен аккаунту. Повторите попытку или продолжите тур.', retry_target: 'Повторить', finish_tour: 'Завершить тур', skip_step: 'Пропустить шаг', interact_hint: 'Используйте выделенный элемент, чтобы продолжить автоматически.', step_progress: 'Шаг {{current}} из {{total}}', back: 'Назад', next: 'Далее', finish: 'Готово', skip_complete: 'Пропустить весь тур', searching_sr: 'Поиск элемента управления.', unavailable_sr: 'Элемент управления недоступен.', rentalhub_dashboard: 'Панель RentalHub' },
    welcome: { benefit_controls: 'Показывает реальные элементы панели', benefit_role: 'Настроен под роль вашего аккаунта RentalHub', benefit_replay: 'Можно повторить в любое время', close_intro: 'Закрыть введение', skip_label: 'Пропустить интерактивный тур', eyebrow: 'Ваш личный помощник', resume_title: 'Продолжите с места остановки', returning_title: 'С возвращением в RentalHub', new_title: 'Добро пожаловать в RentalHub NG', resume_description: 'Прогресс сохранён. Продолжите с последнего просмотренного шага.', returning_description: 'Быстро освежите знания о важных элементах вашего аккаунта.', new_description: 'Посмотрите самые полезные элементы в коротком пошаговом туре.', maybe_later: 'Позже', resume_button: 'Продолжить тур', start_button: 'Начать тур', duration: 'Около 2 минут · всё под вашим контролем' },
    profile: { title: 'Интерактивные туры', description: 'Повторите обзор панели или запустите тематический сценарий.', last_completed: 'Последнее завершение: {{date}}', replay: 'Повторить тур по панели', workflow_library: 'Тематические сценарии', workflow_library_description: 'Практикуйтесь с безопасными контекстными подсказками. Тур не отправляет платежи или формы.', start_workflow: 'Запустить сценарий' },
  },
  zh: {
    ui: { eyebrow: 'RentalHub 引导', close_and_skip: '关闭并跳过引导', finding_target: '正在查找此控件…', not_available_for_account: '此步骤不适用于该账户。', target_not_available: '此控制台区域尚不可用。', target_not_available_body: '它可能仍在加载或不适用于该账户。请重试或继续引导。', retry_target: '重试目标', finish_tour: '完成引导', skip_step: '跳过此步骤', interact_hint: '使用高亮控件即可自动继续。', step_progress: '第 {{current}} 步，共 {{total}} 步', back: '返回', next: '下一步', finish: '完成', skip_complete: '跳过整个引导', searching_sr: '正在查找控制台控件。', unavailable_sr: '控制台控件当前不可用。', rentalhub_dashboard: 'RentalHub 控制台' },
    welcome: { benefit_controls: '高亮控制台中的真实控件', benefit_role: '根据您的 RentalHub 账户角色定制', benefit_replay: '需要复习时可随时重播', close_intro: '关闭引导介绍', skip_label: '跳过引导', eyebrow: '您的个人控制台向导', resume_title: '从上次停止的位置继续', returning_title: '欢迎回到 RentalHub', new_title: '欢迎使用 RentalHub NG', resume_description: '您的进度已保存。可从上次查看的步骤继续。', returning_description: '快速复习对您的账户最重要的控件。', new_description: '通过简短、专注的向导了解最有用的控件。', maybe_later: '稍后', resume_button: '继续引导', start_button: '开始引导', duration: '约 2 分钟 · 全程由您掌控' },
    profile: { title: '引导', description: '重播控制台向导或开始专项流程。', last_completed: '上次完成于 {{date}}', replay: '重播控制台引导', workflow_library: '专项流程向导', workflow_library_description: '通过安全且符合情境的提示练习完整任务。向导不会代您提交付款或表单。', start_workflow: '开始流程向导' },
  },
};

const workflowTranslations = {
  tenant_rental: { fr: ['Parcourir votre location de bout en bout', 'Recherchez, enregistrez, candidatez, échangez, contrôlez les paiements et obtenez de l’aide.'], ar: ['إكمال رحلة الإيجار', 'ابحث واحفظ وقدّم وتواصل وراجع المدفوعات واحصل على الدعم.'], ru: ['Пройдите весь путь аренды', 'Ищите, сохраняйте, подавайте заявку, общайтесь, проверяйте платежи и получайте помощь.'], zh: ['完成您的租房流程', '学习搜索、收藏、申请、沟通、查看付款并获取帮助。'] },
  landlord_listing: { fr: ['Gérer un bien de l’annonce au paiement', 'Parcourez les annonces, la publication, les candidatures, les retraits et l’assistance.'], ar: ['إدارة العقار من الإعلان إلى الدفع', 'تابع الإعلان والنشر والطلبات والسحب والدعم.'], ru: ['Управляйте объектом от объявления до оплаты', 'Пройдите публикацию, заявки, вывод средств и поддержку.'], zh: ['从发布到收款管理房源', '了解发布、申请、提现和支持流程。'] },
  agent_operations: { fr: ['Piloter vos opérations d’agent', 'Consultez affectations, revenus, retraits, biens, messages et assistance.'], ar: ['إدارة عمليات الوكيل', 'راجع التعيينات والأرباح والسحب والعقارات والرسائل والدعم.'], ru: ['Ведите работу агента', 'Просматривайте назначения, доходы, выводы, объекты, сообщения и поддержку.'], zh: ['管理代理运营', '查看分配、收益、提现、房源、消息和支持。'] },
  lawyer_casework: { fr: ['Traiter un dossier juridique de bout en bout', 'Parcourez dossiers, preuves, litiges, messages et assistance.'], ar: ['إدارة العمل القانوني بالكامل', 'تابع القضايا والأدلة والنزاعات والرسائل والدعم.'], ru: ['Ведите юридическое дело от начала до конца', 'Пройдите дела, доказательства, споры, сообщения и поддержку.'], zh: ['端到端处理法律案件', '了解案件、证据、纠纷、消息和支持。'] },
  service_bookings: { fr: ['Réserver et suivre des services fiables', 'Suivez réservations, paiements et assistance de service.'], ar: ['حجز الخدمات الموثوقة ومتابعتها', 'تابع الحجوزات والمدفوعات ودعم الخدمة.'], ru: ['Бронируйте и отслеживайте надёжные услуги', 'Следите за бронированиями, платежами и поддержкой.'], zh: ['预订并跟踪可信服务', '跟踪预订、付款和服务支持。'] },
  account_settings: { fr: ['Sécuriser et personnaliser votre compte', 'Vérifiez profil, identité, préférences et commandes des visites.'], ar: ['تأمين حسابك وتخصيصه', 'راجع الملف والتحقق والتفضيلات وعناصر الجولة.'], ru: ['Защитите и настройте аккаунт', 'Проверьте профиль, верификацию, настройки и управление турами.'], zh: ['保护并个性化您的账户', '查看资料、验证、偏好和引导设置。'] },
};

const genericWorkflowLabels = {
  fr: ['Guide des opérations', 'Suivez le parcours principal de votre rôle avec des étapes sûres et contextuelles.'],
  ar: ['دليل العمليات', 'اتبع المسار التشغيلي الأساسي لدورك بخطوات آمنة ومراعية للسياق.'],
  ru: ['Операционный сценарий', 'Пройдите основной рабочий процесс своей роли с безопасными контекстными подсказками.'],
  zh: ['运营流程向导', '通过安全且符合情境的步骤了解您角色的主要运营流程。'],
};

const adminWorkflowIds = [
  'platform_admin_operations', 'lga_admin_operations', 'state_admin_operations', 'state_financial_operations',
  'financial_admin_operations', 'lga_financial_operations', 'super_financial_operations', 'lga_support_operations',
  'state_support_operations', 'super_support_operations', 'transportation_operations', 'lga_transportation_operations',
  'state_transportation_operations', 'super_transportation_operations', 'fumigation_operations', 'lga_fumigation_operations',
  'state_fumigation_operations', 'super_fumigation_operations', 'recruitment_operations', 'super_admin_operations',
];

const descriptionTemplates = {
  fr: (title) => `Découvrez « ${title} » et suivez les actions affichées en toute sécurité.`,
  ar: (title) => `تعرّف على «${title}» واتبع الإجراءات المعروضة بأمان.`,
  ru: (title) => `Изучите раздел «${title}» и безопасно выполните показанные действия.`,
  zh: (title) => `了解“${title}”，并安全地按照显示的操作继续。`,
};

const actionHints = {
  fr: 'Utilisez la commande mise en évidence pour continuer automatiquement.',
  ar: 'استخدم العنصر المميز للمتابعة تلقائيًا.',
  ru: 'Используйте выделенный элемент, чтобы продолжить автоматически.',
  zh: '使用高亮控件即可自动继续。',
};

const buildStepResources = (locale) => Object.fromEntries(allSteps.map((step, index) => {
  if (locale === 'en') {
    return [step.id, {
      title: step.title,
      description: step.description,
      ...(step.actionHint ? { action_hint: step.actionHint } : {}),
    }];
  }
  const title = titleTranslations[locale]?.[step.title]
    || `${common[locale].ui.eyebrow} ${index + 1}`;
  return [step.id, {
    title,
    description: descriptionTemplates[locale](title),
    ...(step.actionHint ? { action_hint: actionHints[locale] } : {}),
  }];
}));

const buildWorkflowResources = (locale) => {
  const workflows = {};
  Object.values(WORKFLOW_TOURS).forEach((workflow) => {
    if (locale === 'en') {
      workflows[workflow.id] = { title: workflow.title, description: workflow.description };
      return;
    }
    const translated = workflowTranslations[workflow.id]?.[locale] || genericWorkflowLabels[locale];
    workflows[workflow.id] = { title: translated[0], description: translated[1] };
  });
  adminWorkflowIds.forEach((id) => {
    const translated = locale === 'en'
      ? ['Operations guide', 'Follow the main operational path for this account role.']
      : genericWorkflowLabels[locale];
    workflows[id] = { title: translated[0], description: translated[1] };
  });
  return workflows;
};

const analytics = {
  en: {
    nav_label: 'Tour Analytics', load_failed: 'Tour analytics could not be loaded.', eyebrow: 'Product adoption intelligence',
    title: 'Guided tour analytics', description: 'See where users succeed, resume, skip, or encounter unavailable controls across web and mobile tours.',
    refresh: 'Refresh data', filters: 'Analytics filters', period: 'Period', days_7: 'Last 7 days', days_30: 'Last 30 days',
    days_90: 'Last 90 days', days_365: 'Last year', platform: 'Platform', all_platforms: 'All platforms', mobile_apps: 'Mobile apps',
    legacy: 'Legacy', locale: 'Language', all_languages: 'All languages', tour_key: 'Tour key', all_tours: 'All tours', updated: 'Updated {{time}}',
    unique_users: 'Unique users', engaged_detail: '{{count}} engaged', completion_rate: 'Completion rate', completed_detail: '{{count}} completions',
    resumable: 'Resumable tours', paused_detail: '{{count}} paused', target_problems: 'Target problems', target_problem_detail: 'Missing or unavailable controls',
    engaged: 'Engaged users', started: 'Started', resumed: 'Resumed', completed: 'Completed', funnel: 'Adoption funnel',
    funnel_description: 'Unique users moving through the guided experience.', active_state: 'Current tour state',
    active_state_description: 'Live aggregate status for saved tour sessions.', no_state_data: 'No tour state data matches these filters yet.',
    average_progress: 'Average progress', by_tour: 'Performance by tour', tour: 'Tour', users: 'Users', completion: 'Completion', progress: 'Progress',
    skips: 'Skips', no_tours: 'No tour activity matches these filters yet.', diagnostics: 'Target and step diagnostics',
    diagnostics_description: 'The controls and routes that need product attention first.', issue: 'Issue', step: 'Step', route: 'Route', count: 'Count',
    no_issues: 'No missing targets or unavailable steps were recorded.', languages: 'Language adoption', users_lower: 'users',
    no_language_data: 'No language data is available yet.', problem_count_sr: '{{count}} problem steps detected.',
  },
  fr: {
    nav_label: 'Analyse des visites', load_failed: 'Impossible de charger les analyses des visites.', eyebrow: 'Intelligence d’adoption produit',
    title: 'Analyse des visites guidées', description: 'Repérez les réussites, reprises, abandons et commandes indisponibles sur le web et le mobile.',
    refresh: 'Actualiser les données', filters: 'Filtres d’analyse', period: 'Période', days_7: '7 derniers jours', days_30: '30 derniers jours',
    days_90: '90 derniers jours', days_365: 'Dernière année', platform: 'Plateforme', all_platforms: 'Toutes les plateformes',
    mobile_apps: 'Applications mobiles', legacy: 'Ancien système', locale: 'Langue', all_languages: 'Toutes les langues', tour_key: 'Clé de visite',
    all_tours: 'Toutes les visites', updated: 'Mis à jour à {{time}}', unique_users: 'Utilisateurs uniques', engaged_detail: '{{count}} engagés',
    completion_rate: 'Taux d’achèvement', completed_detail: '{{count}} achèvements', resumable: 'Visites reprenables', paused_detail: '{{count}} en pause',
    target_problems: 'Problèmes de cible', target_problem_detail: 'Commandes absentes ou indisponibles', engaged: 'Utilisateurs engagés',
    started: 'Démarrées', resumed: 'Reprises', completed: 'Terminées', funnel: 'Entonnoir d’adoption',
    funnel_description: 'Utilisateurs uniques progressant dans l’expérience guidée.', active_state: 'État actuel des visites',
    active_state_description: 'État agrégé des sessions de visite enregistrées.', no_state_data: 'Aucun état ne correspond à ces filtres.',
    average_progress: 'Progression moyenne', by_tour: 'Performance par visite', tour: 'Visite', users: 'Utilisateurs', completion: 'Achèvement',
    progress: 'Progression', skips: 'Abandons', no_tours: 'Aucune activité ne correspond à ces filtres.', diagnostics: 'Diagnostic des cibles et étapes',
    diagnostics_description: 'Commandes et routes qui nécessitent une intervention en priorité.', issue: 'Problème', step: 'Étape', route: 'Route', count: 'Nombre',
    no_issues: 'Aucune cible absente ni étape indisponible enregistrée.', languages: 'Adoption par langue', users_lower: 'utilisateurs',
    no_language_data: 'Aucune donnée linguistique disponible.', problem_count_sr: '{{count}} étapes problématiques détectées.',
  },
  ar: {
    nav_label: 'تحليلات الجولات', load_failed: 'تعذر تحميل تحليلات الجولات.', eyebrow: 'ذكاء تبني المنتج', title: 'تحليلات الجولات الإرشادية',
    description: 'اعرف أين ينجح المستخدمون أو يتابعون أو يتخطون أو يواجهون عناصر غير متاحة على الويب والجوال.', refresh: 'تحديث البيانات',
    filters: 'مرشحات التحليلات', period: 'الفترة', days_7: 'آخر 7 أيام', days_30: 'آخر 30 يومًا', days_90: 'آخر 90 يومًا', days_365: 'العام الماضي',
    platform: 'المنصة', all_platforms: 'كل المنصات', mobile_apps: 'تطبيقات الجوال', legacy: 'النظام القديم', locale: 'اللغة',
    all_languages: 'كل اللغات', tour_key: 'مفتاح الجولة', all_tours: 'كل الجولات', updated: 'تم التحديث {{time}}', unique_users: 'المستخدمون الفريدون',
    engaged_detail: '{{count}} متفاعلون', completion_rate: 'معدل الإكمال', completed_detail: '{{count}} عمليات إكمال', resumable: 'جولات قابلة للمتابعة',
    paused_detail: '{{count}} متوقفة', target_problems: 'مشكلات العناصر', target_problem_detail: 'عناصر مفقودة أو غير متاحة', engaged: 'المستخدمون المتفاعلون',
    started: 'بدأت', resumed: 'تمت متابعتها', completed: 'اكتملت', funnel: 'مسار التبني', funnel_description: 'المستخدمون الفريدون خلال التجربة الإرشادية.',
    active_state: 'حالة الجولات الحالية', active_state_description: 'الحالة الإجمالية المباشرة لجلسات الجولات المحفوظة.',
    no_state_data: 'لا توجد بيانات حالة تطابق هذه المرشحات.', average_progress: 'متوسط التقدم', by_tour: 'الأداء حسب الجولة', tour: 'الجولة',
    users: 'المستخدمون', completion: 'الإكمال', progress: 'التقدم', skips: 'التخطي', no_tours: 'لا يوجد نشاط جولات يطابق هذه المرشحات.',
    diagnostics: 'تشخيص العناصر والخطوات', diagnostics_description: 'العناصر والمسارات التي تحتاج إلى الاهتمام أولًا.', issue: 'المشكلة', step: 'الخطوة',
    route: 'المسار', count: 'العدد', no_issues: 'لم تُسجّل عناصر مفقودة أو خطوات غير متاحة.', languages: 'التبني حسب اللغة', users_lower: 'مستخدمون',
    no_language_data: 'لا توجد بيانات لغوية بعد.', problem_count_sr: 'تم اكتشاف {{count}} خطوات بها مشكلات.',
  },
  ru: {
    nav_label: 'Аналитика туров', load_failed: 'Не удалось загрузить аналитику туров.', eyebrow: 'Аналитика освоения продукта',
    title: 'Аналитика интерактивных туров', description: 'Узнайте, где пользователи завершают, продолжают, пропускают или встречают недоступные элементы.',
    refresh: 'Обновить данные', filters: 'Фильтры аналитики', period: 'Период', days_7: 'Последние 7 дней', days_30: 'Последние 30 дней',
    days_90: 'Последние 90 дней', days_365: 'Последний год', platform: 'Платформа', all_platforms: 'Все платформы',
    mobile_apps: 'Мобильные приложения', legacy: 'Старая версия', locale: 'Язык', all_languages: 'Все языки', tour_key: 'Ключ тура',
    all_tours: 'Все туры', updated: 'Обновлено в {{time}}', unique_users: 'Уникальные пользователи', engaged_detail: '{{count}} вовлечено',
    completion_rate: 'Доля завершений', completed_detail: '{{count}} завершений', resumable: 'Туры для продолжения', paused_detail: '{{count}} приостановлено',
    target_problems: 'Проблемы элементов', target_problem_detail: 'Отсутствующие или недоступные элементы', engaged: 'Вовлечённые пользователи',
    started: 'Начато', resumed: 'Продолжено', completed: 'Завершено', funnel: 'Воронка освоения',
    funnel_description: 'Уникальные пользователи на этапах интерактивного тура.', active_state: 'Текущее состояние туров',
    active_state_description: 'Сводное состояние сохранённых сеансов.', no_state_data: 'Нет состояний, соответствующих этим фильтрам.',
    average_progress: 'Средний прогресс', by_tour: 'Показатели по турам', tour: 'Тур', users: 'Пользователи', completion: 'Завершение',
    progress: 'Прогресс', skips: 'Пропуски', no_tours: 'Нет активности, соответствующей этим фильтрам.', diagnostics: 'Диагностика элементов и шагов',
    diagnostics_description: 'Элементы и маршруты, которым в первую очередь требуется внимание.', issue: 'Проблема', step: 'Шаг', route: 'Маршрут', count: 'Количество',
    no_issues: 'Отсутствующие элементы и недоступные шаги не зарегистрированы.', languages: 'Освоение по языкам', users_lower: 'пользователей',
    no_language_data: 'Данные по языкам пока отсутствуют.', problem_count_sr: 'Обнаружено проблемных шагов: {{count}}.',
  },
  zh: {
    nav_label: '引导分析', load_failed: '无法加载引导分析。', eyebrow: '产品采用洞察', title: '引导分析',
    description: '了解用户在网页和移动端完成、继续、跳过或遇到不可用控件的位置。', refresh: '刷新数据', filters: '分析筛选器',
    period: '时间范围', days_7: '最近 7 天', days_30: '最近 30 天', days_90: '最近 90 天', days_365: '最近一年', platform: '平台',
    all_platforms: '所有平台', mobile_apps: '移动应用', legacy: '旧版', locale: '语言', all_languages: '所有语言', tour_key: '引导键',
    all_tours: '所有引导', updated: '更新于 {{time}}', unique_users: '独立用户', engaged_detail: '{{count}} 位已参与', completion_rate: '完成率',
    completed_detail: '{{count}} 次完成', resumable: '可继续的引导', paused_detail: '{{count}} 个已暂停', target_problems: '目标问题',
    target_problem_detail: '控件缺失或不可用', engaged: '参与用户', started: '已开始', resumed: '已继续', completed: '已完成',
    funnel: '采用漏斗', funnel_description: '在引导体验中推进的独立用户。', active_state: '当前引导状态',
    active_state_description: '已保存引导会话的实时汇总状态。', no_state_data: '没有与筛选条件匹配的状态数据。', average_progress: '平均进度',
    by_tour: '按引导查看绩效', tour: '引导', users: '用户', completion: '完成', progress: '进度', skips: '跳过', no_tours: '没有匹配的引导活动。',
    diagnostics: '目标与步骤诊断', diagnostics_description: '优先需要产品关注的控件和路由。', issue: '问题', step: '步骤', route: '路由', count: '数量',
    no_issues: '未记录缺失目标或不可用步骤。', languages: '语言采用情况', users_lower: '位用户', no_language_data: '暂无语言数据。',
    problem_count_sr: '检测到 {{count}} 个问题步骤。',
  },
};

const tourTranslations = Object.fromEntries(['en', 'fr', 'ar', 'ru', 'zh'].map((locale) => [locale, {
  ...common[locale],
  locale_code: locale,
  ui: {
    ...common[locale].ui,
    dashboard_title: common[locale].ui.rentalhub_dashboard,
    dialog_label: locale === 'en' ? '{{title}} guided tour' : common[locale].ui.eyebrow,
    use_highlighted_control: common[locale].ui.interact_hint,
    generic_step_description: locale === 'en'
      ? 'Learn how to use __TITLE__ safely and confidently in RentalHub. Follow the highlighted control to continue.'
      : descriptionTemplates[locale]('__TITLE__'),
    generic_workflow_description: locale === 'en'
      ? 'Follow the complete __TITLE__ workflow with safe, contextual guidance.'
      : descriptionTemplates[locale]('__TITLE__'),
    generic_action_hint: locale === 'en'
      ? 'Use the highlighted control to continue automatically.'
      : actionHints[locale],
  },
  analytics: analytics[locale],
  workflows: buildWorkflowResources(locale),
  titles: Object.fromEntries(
    Object.entries(buildStepResources(locale)).map(([id, copy]) => [id, copy.title]),
  ),
}]));

export default tourTranslations;
