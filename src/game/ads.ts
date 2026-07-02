// ---------- Anúncios premiados (rewarded) ----------
// "Assistir uma propaganda" para liberar a velocidade acelerada (2×/5×/10×).
//
// MODO DEV (agora): o anúncio é SIMULADO — considerado "assistido" na hora, sem SDK.
// Mantenha DEV_ADS = true enquanto não houver AdMob integrado (senão acelerar não funciona,
// nem no preview nem online, pois não existe SDK de anúncio no navegador puro).
//
// PRODUÇÃO (Play Store): empacotar com Capacitor e trocar o ramo abaixo pela chamada real do
// AdMob (@capacitor-community/admob) — resolvendo `true` SÓ se o usuário assistir o vídeo até o fim.
export const DEV_ADS = true

export async function showRewardedAd(): Promise<boolean> {
  if (DEV_ADS) return true // dev: propaganda "vista" instantaneamente
  // TODO produção (Capacitor + AdMob):
  //   const { AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob')
  //   await AdMob.prepareRewardVideoAd({ adId: '<SEU_AD_UNIT_ID>' })
  //   const reward = await AdMob.showRewardVideoAd()
  //   return !!reward // recompensa entregue só se assistiu até o fim
  return false
}
