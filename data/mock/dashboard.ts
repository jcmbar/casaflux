export const summaryCards = [
    {
      title: "Saldo do mês",
      value: "R$ 8.420,00",
      change: "+12% em relação ao mês passado",
      trend: "up",
    },
    {
      title: "Receitas",
      value: "R$ 15.300,00",
      change: "+4 novas entradas",
      trend: "up",
    },
    {
      title: "Despesas",
      value: "R$ 6.880,00",
      change: "-3% na última semana",
      trend: "down",
    },
    {
      title: "Reserva",
      value: "R$ 32.500,00",
      change: "Meta anual em dia",
      trend: "neutral",
    },
  ] as const
  
  export const expenseCategories = [
    { name: "Moradia", amount: 2400, percentage: 35 },
    { name: "Alimentação", amount: 1450, percentage: 21 },
    { name: "Transporte", amount: 920, percentage: 13 },
    { name: "Educação", amount: 780, percentage: 11 },
    { name: "Lazer", amount: 620, percentage: 9 },
    { name: "Outros", amount: 710, percentage: 11 },
  ]
  
  export const upcomingBills = [
    { title: "Condomínio", dueDate: "2 dias", amount: "R$ 850,00", status: "alto" },
    { title: "Internet", dueDate: "4 dias", amount: "R$ 120,00", status: "baixo" },
    { title: "Escola", dueDate: "5 dias", amount: "R$ 980,00", status: "médio" },
  ]
  
  export const goalsHighlight = [
    { title: "Viagem em família", current: 8400, target: 12000 },
    { title: "Reserva de emergência", current: 32500, target: 40000 },
    { title: "Novo carro", current: 18000, target: 55000 },
  ]
  
  export const familyOverview = [
    {
      name: "Jefferson",
      role: "Responsável financeiro",
      income: "R$ 9.500,00",
      expenses: "R$ 4.200,00",
    },
    {
      name: "Parceira",
      role: "Planejamento da casa",
      income: "R$ 5.800,00",
      expenses: "R$ 2.100,00",
    },
  ]
  