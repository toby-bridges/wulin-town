import clsx from 'clsx';
import { MouseEventHandler, ReactNode, KeyboardEvent } from 'react';

export default function Button(props: {
  className?: string;
  href?: string;
  imgUrl: string;
  onClick?: MouseEventHandler;
  title?: string;
  children: ReactNode;
}) {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Allow Enter and Space to trigger click for keyboard accessibility
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      props.onClick?.(e as any);
    }
  };

  const buttonContent = (
    <div className="inline-block bg-clay-700">
      <span>
        <div className="inline-flex h-full items-center gap-4">
          <img className="w-4 h-4 sm:w-[30px] sm:h-[30px]" src={props.imgUrl} alt="" />
          {props.children}
        </div>
      </span>
    </div>
  );

  // Use <a> for links, <button> for actions
  if (props.href) {
    return (
      <a
        className={clsx(
          'button text-white shadow-solid text-xl pointer-events-auto',
          props.className,
        )}
        href={props.href}
        title={props.title}
        rel="noopener noreferrer"
      >
        {buttonContent}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={clsx(
        'button text-white shadow-solid text-xl pointer-events-auto',
        props.className,
      )}
      title={props.title}
      onClick={props.onClick}
      onKeyDown={handleKeyDown}
    >
      {buttonContent}
    </button>
  );
}
