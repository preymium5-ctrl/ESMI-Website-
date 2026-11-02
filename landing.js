import {setupLandingEffects} from './landing-effects.js';

const landing = document.querySelector('#landing');
const video = document.querySelector('#landing-video');
const menu = document.querySelector('#landing-menu');
const menuToggle = document.querySelector('#landing-menu-toggle');
const menuClose = document.querySelector('.landing-menu-close');
const utility = document.querySelector('#landing-sound-toggle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const portraitMedia = matchMedia('(max-width:760px)');
const portraitAspect = matchMedia('(max-aspect-ratio:4/5)');
const mediaVariants = {
  desktop:{src:video.dataset.desktopSrc,poster:video.dataset.desktopPoster},
  portrait:{src:video.dataset.portraitSrc,poster:video.dataset.portraitPoster},
};

document.body.classList.add('has-landing');
let previousFocus = null;
let restoreMenuFocus = true;
let heroVisible = true;
let manualMotion = null;
let utilityMode = video.dataset.hasAudio === 'false' ? 'motion' : 'sound';
let activeVariant = '';
let mediaVersion = 0;
let pendingPlaybackRatio = null;
const menuPanel = menu.querySelector('.landing-menu-panel');
const menuItems = [...menu.querySelectorAll('.landing-menu-navigation>:is(button,a),.landing-menu-footer')];
let menuVersion = 0;
let menuAnimations = [];
let menuTransition = Promise.resolve();
const landingEffects = setupLandingEffects({landing,video,menu,reducedMotion});

function emitAction(action, detail = {}) {
  document.dispatchEvent(new CustomEvent('esmi:landing-action',{detail:{action,...detail}}));
}

// Keep the native dialog's focus trap while its panel animates in the top layer.
// Capture current transforms before cancelling so an interrupted transition stays continuous.
function animateMenu(opening) {
  const version = ++menuVersion;
  const panelFrom = getComputedStyle(menuPanel).transform;
  const itemFrom = menuItems.map(item=>{
    const style = getComputedStyle(item);
    return {opacity:style.opacity,transform:style.transform};
  });
  menuAnimations.forEach(animation=>animation.cancel());
  menuAnimations = [];
  menu.dataset.state = opening ? 'opening' : 'closing';
  document.body.classList.toggle('landing-menu-open',opening);
  const duration = reducedMotion.matches ? 0 : opening ? 1050 : 750;
  menuAnimations.push(menuPanel.animate([
    {transform:panelFrom},
    {transform:opening ? 'translate3d(0,0,0)' : 'translate3d(105%,0,0)'},
  ],{duration,easing:'cubic-bezier(.22,.8,.2,1)',fill:'both'}));
  menuItems.forEach((item,index)=>{
    menuAnimations.push(item.animate([
      itemFrom[index],
      {opacity:opening ? 1 : 0,transform:opening ? 'translate3d(0,0,0)' : 'translate3d(0,24px,0)'},
    ],{
      duration:reducedMotion.matches ? 0 : opening ? 650 : 220,
      delay:reducedMotion.matches ? 0 : opening ? 250+index*85 : (menuItems.length-index-1)*25,
      easing:'cubic-bezier(.19,1,.22,1)',fill:'both',
    }));
  });
  menuTransition = Promise.allSettled(menuAnimations.map(animation=>animation.finished)).then(()=>{
    if (version !== menuVersion) return;
    menu.dataset.state = opening ? 'open' : 'closed';
    menuAnimations.forEach(animation=>animation.cancel());
    menuAnimations = [];
    if (!opening) menu.close();
  });
  return menuTransition;
}

function openMenu() {
  if (menu.open && menu.dataset.state !== 'closing') return;
  if (!menu.open) {
    previousFocus = document.activeElement;
    restoreMenuFocus = true;
    menu.showModal();
    document.body.classList.add('landing-menu-active');
  }
  menuToggle.setAttribute('aria-expanded','true');
  animateMenu(true);
  menuClose.focus({preventScroll:true});
}

function closeMenu(restore = true) {
  if (!menu.open) return Promise.resolve();
  restoreMenuFocus = restore;
  if (menu.dataset.state === 'closing') return menuTransition;
  return animateMenu(false);
}

menuToggle.addEventListener('click',openMenu);
menuClose.addEventListener('click',()=>closeMenu());
menu.addEventListener('cancel',event=>{
  event.preventDefault();
  closeMenu();
});
menu.addEventListener('click',event=>{
  if (event.target === menu) closeMenu();
});
menu.addEventListener('close',()=>{
  menuVersion++;
  menuAnimations.forEach(animation=>animation.cancel());
  menuAnimations = [];
  menu.dataset.state = 'closed';
  document.body.classList.remove('landing-menu-open');
  document.body.classList.remove('landing-menu-active');
  menuToggle.setAttribute('aria-expanded','false');
  if (restoreMenuFocus && previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
  restoreMenuFocus = true;
});

document.querySelectorAll('[data-landing-action]').forEach(control=>{
  control.addEventListener('click',async event=>{
    const action = control.dataset.landingAction;
    // Let real links open in a new tab or window as usual.
    if (control.href && (event.ctrlKey || event.metaKey || event.shiftKey)) return;
    event.preventDefault();
    await closeMenu(false);
    if (action === 'index') {
      landing.scrollIntoView({block:'start',behavior:reducedMotion.matches ? 'instant' : 'smooth'});
      return;
    }
    emitAction(action);
  });
});

function updateUtility() {
  utility.dataset.utilityMode = utilityMode;
  if (utilityMode === 'motion') {
    const playing = !video.paused;
    utility.setAttribute('aria-pressed',String(playing));
    utility.setAttribute('aria-label',playing ? 'Pause background motion' : 'Play background motion');
  } else {
    utility.setAttribute('aria-pressed',String(!video.muted));
    utility.setAttribute('aria-label',video.muted ? 'Enable ambient sound' : 'Mute ambient sound');
  }
}

function syncMotion() {
  const shouldPlay = (manualMotion ?? !reducedMotion.matches) && heroVisible && !document.hidden;
  const version = mediaVersion;
  if (shouldPlay) {
    video.play().then(()=>{
      if (version !== mediaVersion) return;
      landing.dataset.mediaState = 'playing';
      updateUtility();
    }).catch(()=>{
      if (version !== mediaVersion) return;
      landing.dataset.mediaState = 'poster';
      updateUtility();
    });
  } else {
    video.pause();
    updateUtility();
  }
}

function selectHeroMedia() {
  const variant = portraitMedia.matches && portraitAspect.matches ? 'portrait' : 'desktop';
  if (variant === activeVariant) return;
  const source = mediaVariants[variant];
  if (!source.src || !source.poster) return;
  const duration = video.duration;
  pendingPlaybackRatio = Number.isFinite(duration) && duration > 0 ? video.currentTime/duration : 0;
  const muted = video.muted;
  activeVariant = variant;
  mediaVersion++;
  landing.dataset.mediaVariant = variant;
  landing.dataset.mediaState = 'poster';
  video.pause();
  video.style.opacity = '0';
  video.poster = source.poster;
  video.src = source.src;
  video.muted = muted;
  video.load();
  syncMotion();
}

utility.addEventListener('click',()=>{
  if (utilityMode === 'motion') {
    manualMotion = !(manualMotion ?? !reducedMotion.matches);
    syncMotion();
  } else {
    video.muted = !video.muted;
    updateUtility();
    emitAction('sound',{enabled:!video.muted});
  }
});

// The media owner can select motion controls for an intentionally silent loop.
document.addEventListener('esmi:landing-media',event=>{
  if (typeof event.detail?.hasAudio !== 'boolean') return;
  utilityMode = event.detail.hasAudio ? 'sound' : 'motion';
  updateUtility();
});

reducedMotion.addEventListener('change',()=>{
  manualMotion = null;
  syncMotion();
});
document.addEventListener('visibilitychange',syncMotion);
portraitMedia.addEventListener('change',selectHeroMedia);
portraitAspect.addEventListener('change',selectHeroMedia);
video.addEventListener('loadedmetadata',()=>{
  if (pendingPlaybackRatio !== null && Number.isFinite(video.duration) && video.duration > 0) {
    video.currentTime = Math.min(Math.max(0,video.duration-.05),pendingPlaybackRatio*video.duration);
    pendingPlaybackRatio = null;
  }
  syncMotion();
});
video.addEventListener('loadeddata',()=>{
  video.style.opacity = '1';
  syncMotion();
});
video.addEventListener('play',updateUtility);
video.addEventListener('pause',updateUtility);
video.addEventListener('error',()=>{
  landing.dataset.mediaState = 'poster';
  video.style.opacity = '0';
  updateUtility();
});

new IntersectionObserver(entries=>{
  heroVisible = entries[0].isIntersecting && entries[0].intersectionRatio > .025;
  if (!heroVisible) landing.classList.remove('landing-pointer-active');
  syncMotion();
},{threshold:[0,.025,.5]}).observe(landing);

window.addEventListener('pagehide',event=>{
  video.pause();
  if (!event.persisted) landingEffects.destroy();
});
updateUtility();
selectHeroMedia();

