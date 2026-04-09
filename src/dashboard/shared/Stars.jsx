import styles from './Stars.module.css';

export default function Stars({ rating }) {
  const full = Math.round(rating);
  return (
    <div className={styles.ratingWrap}>
      {[1,2,3,4,5].map((i) => (
        <svg aria-hidden="true" key={i} viewBox="0 0 16 16" width="12" height="12" className={styles.ratingStar} data-filled={i <= full}>
          <path d="M8 1.5l1.76 3.56 3.93.57-2.84 2.77.67 3.91L8 10.27 4.48 12.31l.67-3.91L2.31 5.63l3.93-.57z"
            fill={i <= full ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}
