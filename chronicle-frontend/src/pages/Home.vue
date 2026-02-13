<template>
  <div class="home-container">
    <div class="hero">
        <h1>Chronicle for Eightyfor</h1>
        <p>Love what you wanna love, be what you wanna be.<br>
        爱我所爱，自成一派。</p>
        <router-link to="/blogs" class="cta-btn">View Blogs</router-link>
    </div>
  </div>
</template>

<style scoped>
.home-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 100px 20px;
    color: #fff;
    text-align: center;
}
.hero h1 {
    font-size: 3.5rem;
    margin-bottom: 20px;
    background: -webkit-linear-gradient(315deg, #42d392 25%, #647eff);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}
.hero p {
    font-size: 1.5rem;
    color: #888;
    margin-bottom: 40px;
}
.cta-btn {
    display: inline-block;
    background: #2ea35f;
    color: white;
    padding: 12px 24px;
    border-radius: 6px;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    transition: background 0.3s;
}
.cta-btn:hover {
    background: #24804a;
}
</style>