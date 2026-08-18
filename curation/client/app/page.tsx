import { Suspense } from "react";

import HeroVideo from "@/components/HeroVideo";
import BrandToggle from "@/features/search/presentation/components/BrandToggle";
import LandingFinder from "@/features/search/presentation/components/LandingFinder";

export default function LandingPage() {
  return (
    <main className="tf-home">
      <a className="tf-skip-link" href="#finder">
        검색으로 바로가기
      </a>

      <HeroVideo />
      <div className="tf-home__veil" aria-hidden="true" />

      <header className="tf-nav">
        <Suspense fallback={<span className="tf-nav__brand">티:파운드</span>}>
          <BrandToggle />
        </Suspense>
      </header>

      <section className="tf-hero" aria-labelledby="hero-title">
        <h1 id="hero-title" className="tf-hero__title">
          입고 싶은 티셔츠,
          <br />
          <span>문장으로 검색하세요</span>
        </h1>

        <LandingFinder />
      </section>
    </main>
  );
}
